import { and, eq, ne } from "drizzle-orm";
import {
  normalizeStatementAccountType,
  statementTypeToLedgerFields,
} from "@/domains/dashboard/domain/accountCategory";
import { enrichTransactionsForUpload } from "@/domains/enrichment/application/enrichTransactions";
import {
  checkStatementBalance,
  dedupeParsedTransactions,
  type StatementBalanceCheck,
} from "@/domains/statements/application/balanceStatement";
import { loadCategoryVocabulary } from "@/domains/statements/application/categoryVocabulary";
import { polishParsedStatement } from "@/domains/statements/application/polishParsedStatement";
import { runCategoryHygienePipeline } from "@/domains/statements/application/runCategoryHygienePipeline";
import {
  MANUAL_INSTITUTION_ID,
  manualAccountId,
  normalizeStatementText,
  statementFileHash,
  statementOccurrenceKey,
  statementSoftMatchKey,
  statementTransactionId,
} from "@/domains/statements/domain/parsedStatement";
import {
  isMistralConfigured,
  ocrPdf,
} from "@/domains/statements/infrastructure/mistralOcr";
import {
  isOpenRouterConfigured,
  parseStatementWithOpenRouter,
  rebalanceParsedStatement,
} from "@/domains/statements/infrastructure/openRouterParse";
import { runStage } from "@/shared/ai/runStage";
import { errorMessage } from "@/shared/lib/error-message";
import { createClient } from "@libsql/client";
import { getDb } from "@/shared/db";
import {
  accounts,
  institutions,
  statementUploads,
  transactions,
} from "@/shared/db/schema";
import type {
  ImportBankStatementResult,
  ImportEnrichmentSummary,
  ImportHygieneSummary,
} from "@/domains/statements/domain/importResult";

function rawSqlClient() {
  return createClient({
    url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
    ...(process.env.DATABASE_AUTH_TOKEN
      ? { authToken: process.env.DATABASE_AUTH_TOKEN }
      : {}),
  });
}

export type {
  ImportBankStatementResult,
  ImportBankStatementSuccess,
  ImportEnrichmentSummary,
  ImportHygieneSummary,
} from "@/domains/statements/domain/importResult";

async function ensureManualLedger() {
  const db = getDb();

  const existingItem = await db
    .select()
    .from(institutions)
    .where(eq(institutions.institutionId, MANUAL_INSTITUTION_ID))
    .limit(1);

  if (!existingItem[0]) {
    await db.insert(institutions).values({
      institutionId: MANUAL_INSTITUTION_ID,
      name: "Manual statement uploads",
    });
  }
}

async function ensureStatementUploadColumns() {
  const client = rawSqlClient();
  const alters = [
    "ALTER TABLE statement_uploads ADD COLUMN file_hash TEXT",
    "ALTER TABLE statement_uploads ADD COLUMN inserted_count INTEGER DEFAULT 0",
    "ALTER TABLE statement_uploads ADD COLUMN updated_count INTEGER DEFAULT 0",
    "ALTER TABLE statement_uploads ADD COLUMN skipped_count INTEGER DEFAULT 0",
    "ALTER TABLE statement_uploads ADD COLUMN statement_period_start TEXT",
    "ALTER TABLE statement_uploads ADD COLUMN statement_period_end TEXT",
    "ALTER TABLE statement_uploads ADD COLUMN opening_balance REAL",
    "ALTER TABLE statement_uploads ADD COLUMN closing_balance REAL",
    "ALTER TABLE statement_uploads ADD COLUMN total_debits REAL",
    "ALTER TABLE statement_uploads ADD COLUMN total_credits REAL",
    "ALTER TABLE statement_uploads ADD COLUMN transaction_sum REAL",
    "ALTER TABLE statement_uploads ADD COLUMN computed_closing REAL",
    "ALTER TABLE statement_uploads ADD COLUMN balance_delta REAL",
    "ALTER TABLE statement_uploads ADD COLUMN balance_ok INTEGER",
  ];

  for (const sqlText of alters) {
    try {
      await client.execute(sqlText);
    } catch {
      // Column already exists.
    }
  }

  try {
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS statement_uploads_file_hash_uidx ON statement_uploads(file_hash)",
    );
  } catch {
    // Index may already exist.
  }
}

function parseIsoDays(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function datesNear(
  a: string | null | undefined,
  b: string | null | undefined,
  maxDays: number,
) {
  const aDays = parseIsoDays(a);
  const bDays = parseIsoDays(b);
  if (aDays == null || bDays == null) return false;
  return Math.abs(aDays - bDays) <= maxDays;
}

type SoftMatchRow = {
  id: number;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  authorizedDate: string | null;
  statementUploadId: number | null;
};

function findSoftTwin(
  candidates: SoftMatchRow[],
  params: {
    description: string;
    amount: number;
    date: string;
    authorizedDate: string | null;
  },
) {
  const wantKey = statementSoftMatchKey(params.description, params.amount);
  return candidates.find((row) => {
    if (row.amount !== params.amount) return false;
    const rowKey = statementSoftMatchKey(row.name, row.amount);
    const merchantKey = row.merchantName
      ? statementSoftMatchKey(row.merchantName, row.amount)
      : null;
    if (rowKey !== wantKey && merchantKey !== wantKey) {
      // Allow loose merchant overlap when descriptions share a long stem.
      const a = normalizeStatementText(params.description);
      const b = normalizeStatementText(row.name);
      if (!a || !b || (a.length > 12 && !b.includes(a.slice(0, 12)) && !a.includes(b.slice(0, 12)))) {
        return false;
      }
    }

    if (row.date === params.date) return true;
    if (
      params.authorizedDate &&
      (row.date === params.authorizedDate ||
        row.authorizedDate === params.date ||
        row.authorizedDate === params.authorizedDate)
    ) {
      return true;
    }
    return (
      datesNear(row.date, params.date, 7) ||
      datesNear(row.date, params.authorizedDate, 7) ||
      datesNear(row.authorizedDate, params.date, 7)
    );
  });
}

export async function importBankStatement(params: {
  filename: string;
  bytes: Buffer;
  /** Skip hygiene + enrichment. Use for bulk import, then run those once. */
  skipPostProcess?: boolean;
  /** Folder or product hint, e.g. visa1654 or loc52839. */
  sourceHint?: string;
}): Promise<ImportBankStatementResult> {
  if (!isMistralConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "MISTRAL_NOT_CONFIGURED",
      error: "Missing MISTRAL_API_KEY. Add it to .env.local.",
    };
  }

  if (!isOpenRouterConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "OPENROUTER_NOT_CONFIGURED",
      error: "Missing OPENROUTER_API_KEY. Add it to .env.local.",
    };
  }

  if (!params.filename.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false,
      status: 400,
      error: "Only PDF bank statements are supported.",
    };
  }

  if (params.bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "Empty file." };
  }

  if (params.bytes.byteLength > 20 * 1024 * 1024) {
    return {
      ok: false,
      status: 400,
      error: "PDF must be 20MB or smaller.",
    };
  }

  const db = getDb();
  await ensureManualLedger();
  await ensureStatementUploadColumns();

  const fileHash = statementFileHash(params.bytes);

  const prior = await db
    .select()
    .from(statementUploads)
    .where(
      and(
        eq(statementUploads.fileHash, fileHash),
        eq(statementUploads.status, "completed"),
      ),
    )
    .limit(1);

  if (prior[0]) {
    const existing = prior[0];
    return {
      ok: true,
      uploadId: existing.id,
      transactionCount: existing.transactionCount ?? 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: existing.transactionCount ?? 0,
      removedTwinCount: 0,
      duplicateFile: true,
      institutionName: existing.institutionName,
      accountName: existing.accountName,
      pageCount: existing.pageCount ?? 0,
      statementPeriodStart: existing.statementPeriodStart ?? null,
      statementPeriodEnd: existing.statementPeriodEnd ?? null,
      openingBalance: existing.openingBalance ?? null,
      closingBalance: existing.closingBalance ?? null,
      transactionSum: existing.transactionSum ?? null,
      computedClosing: existing.computedClosing ?? null,
      balanceDelta: existing.balanceDelta ?? null,
      balanceOk: existing.balanceOk ?? null,
    };
  }

  await db
    .delete(statementUploads)
    .where(
      and(
        eq(statementUploads.fileHash, fileHash),
        ne(statementUploads.status, "completed"),
      ),
    );

  const [upload] = await db
    .insert(statementUploads)
    .values({
      filename: params.filename,
      fileHash,
      status: "processing",
    })
    .returning();

  try {
    const ocrStarted = Date.now();
    const ocr = await ocrPdf({
      filename: params.filename,
      bytes: params.bytes,
    });
    console.info(
      `[statements] OCR pages=${ocr.pageCount} in ${Date.now() - ocrStarted}ms`,
    );

    if (!ocr.markdown.trim()) {
      throw new Error("OCR returned no readable text from this PDF.");
    }

    await db
      .update(statementUploads)
      .set({
        ocrMarkdown: ocr.markdown,
        pageCount: ocr.pageCount,
      })
      .where(eq(statementUploads.id, upload.id));

    const vocabulary = await loadCategoryVocabulary();
    const sourceHint = params.sourceHint?.trim() || params.filename;
    const parseOptions = { vocabulary, sourceHint };
    let rawParsed = await parseStatementWithOpenRouter(ocr.markdown, parseOptions);
    let parsed = polishParsedStatement(rawParsed, {
      vocabulary,
      ocrMarkdown: ocr.markdown,
      sourceHint,
      dedupe: dedupeParsedTransactions,
    });
    let balance = checkStatementBalance(parsed);

    if (balance.balanced === false) {
      console.warn(
        `[statements] balance miss delta=${balance.delta} sum=${balance.transactionSum} opening=${balance.openingBalance} closing=${balance.closingBalance}; rebalancing`,
      );
      try {
        rawParsed = await rebalanceParsedStatement(
          ocr.markdown,
          parsed,
          balance,
          parseOptions,
        );
        parsed = polishParsedStatement(rawParsed, {
          vocabulary,
          ocrMarkdown: ocr.markdown,
          sourceHint,
          dedupe: dedupeParsedTransactions,
        });
        balance = checkStatementBalance(parsed);
      } catch (error) {
        console.warn(
          "[statements] rebalance failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    console.info(
      `[statements] balance ok=${balance.balanced} delta=${balance.delta} txns=${balance.transactionCount} sum=${balance.transactionSum}`,
    );

    const normalizedAccountType = normalizeStatementAccountType(
      parsed.accountType,
    );
    const ledgerFields = statementTypeToLedgerFields(normalizedAccountType);
    const accountId = manualAccountId({
      institutionName: parsed.institutionName,
      accountMask: parsed.accountMask,
      accountType: normalizedAccountType,
    });
    const currency = parsed.currency || "CAD";

    const existingAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.accountId, accountId))
      .limit(1);

    const accountValues = {
      accountId,
      institutionId: MANUAL_INSTITUTION_ID,
      name:
        parsed.accountName ||
        parsed.institutionName ||
        `Statement ${upload.id}`,
      officialName: parsed.institutionName,
      mask: parsed.accountMask,
      type: ledgerFields.type,
      subtype: ledgerFields.subtype,
      currentBalance: parsed.closingBalance,
      isoCurrencyCode: currency,
      updatedAt: new Date(),
    };

    if (existingAccount[0]) {
      await db
        .update(accounts)
        .set(accountValues)
        .where(eq(accounts.accountId, accountId));
    } else {
      await db.insert(accounts).values(accountValues);
    }

    const existingOnAccount = await db
      .select({
        id: transactions.id,
        transactionId: transactions.transactionId,
        name: transactions.name,
        merchantName: transactions.merchantName,
        amount: transactions.amount,
        date: transactions.date,
        authorizedDate: transactions.authorizedDate,
        statementUploadId: transactions.statementUploadId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.source, "statement"),
        ),
      );

    const softPool: SoftMatchRow[] = existingOnAccount.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      name: row.name,
      merchantName: row.merchantName,
      amount: row.amount,
      date: row.date,
      authorizedDate: row.authorizedDate,
      statementUploadId: row.statementUploadId,
    }));

    const occurrence = new Map<string, number>();
    const claimedSoftIds = new Set<number>();
    let insertedCount = 0;
    let updatedCount = 0;
    let removedTwinCount = 0;
    const keptIds = new Set<number>();

    for (const txn of parsed.transactions) {
      const occKey = statementOccurrenceKey(
        txn.date,
        txn.description,
        txn.amount,
      );
      const occurrenceIndex = occurrence.get(occKey) ?? 0;
      occurrence.set(occKey, occurrenceIndex + 1);

      const externalId = statementTransactionId(
        accountId,
        txn.date,
        txn.description,
        txn.amount,
        occurrenceIndex,
      );

      const paymentMetaJson = JSON.stringify({
        reference_number: txn.referenceNumber,
        foreign_amount: txn.foreignAmount,
        foreign_currency: txn.foreignCurrency,
        statement_period_start: parsed.statementPeriodStart,
        statement_period_end: parsed.statementPeriodEnd,
        opening_balance: parsed.openingBalance,
        closing_balance: parsed.closingBalance,
      });

      const existingTxn = await db
        .select({
          id: transactions.id,
          name: transactions.name,
          merchantName: transactions.merchantName,
          categoryPrimary: transactions.categoryPrimary,
          categoryDetailed: transactions.categoryDetailed,
          categoryConfidence: transactions.categoryConfidence,
          paymentChannel: transactions.paymentChannel,
          transactionCode: transactions.transactionCode,
          locationCity: transactions.locationCity,
          locationRegion: transactions.locationRegion,
          locationCountry: transactions.locationCountry,
          authorizedDate: transactions.authorizedDate,
          runningBalance: transactions.runningBalance,
          checkNumber: transactions.checkNumber,
          paymentMetaJson: transactions.paymentMetaJson,
          statementUploadId: transactions.statementUploadId,
        })
        .from(transactions)
        .where(eq(transactions.transactionId, externalId))
        .limit(1);

      const softTwin =
        existingTxn[0]
          ? null
          : findSoftTwin(
              softPool.filter((row) => !claimedSoftIds.has(row.id)),
              {
                description: txn.description,
                amount: txn.amount,
                date: txn.date,
                authorizedDate: txn.authorizedDate,
              },
            );

      const targetId = existingTxn[0]?.id ?? softTwin?.id ?? null;

      if (targetId != null) {
        if (softTwin) claimedSoftIds.add(softTwin.id);

        await db
          .update(transactions)
          .set({
            transactionId: externalId,
            accountId,
            name: txn.description,
            merchantName:
              txn.merchantName ??
              existingTxn[0]?.merchantName ??
              softTwin?.merchantName ??
              null,
            amount: txn.amount,
            isoCurrencyCode: currency,
            date: txn.date,
            authorizedDate:
              txn.authorizedDate ??
              existingTxn[0]?.authorizedDate ??
              softTwin?.authorizedDate ??
              null,
            pending: txn.pending,
            categoryPrimary:
              txn.categoryPrimary ?? existingTxn[0]?.categoryPrimary ?? null,
            categoryDetailed:
              txn.categoryDetailed ?? existingTxn[0]?.categoryDetailed ?? null,
            categoryConfidence:
              txn.categoryConfidence ??
              existingTxn[0]?.categoryConfidence ??
              null,
            paymentChannel:
              txn.paymentChannel ?? existingTxn[0]?.paymentChannel ?? null,
            transactionCode:
              txn.transactionCode ?? existingTxn[0]?.transactionCode ?? null,
            checkNumber: txn.checkNumber ?? existingTxn[0]?.checkNumber ?? null,
            locationCity:
              txn.locationCity ?? existingTxn[0]?.locationCity ?? null,
            locationRegion:
              txn.locationRegion ?? existingTxn[0]?.locationRegion ?? null,
            locationCountry:
              txn.locationCountry ?? existingTxn[0]?.locationCountry ?? null,
            runningBalance:
              txn.runningBalance ?? existingTxn[0]?.runningBalance ?? null,
            originalDescription: txn.description,
            paymentMetaJson,
            source: "statement",
            statementUploadId: upload.id,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, targetId));

        keptIds.add(targetId);
        updatedCount += 1;
        continue;
      }

      const [inserted] = await db
        .insert(transactions)
        .values({
          transactionId: externalId,
          accountId,
          institutionId: MANUAL_INSTITUTION_ID,
          name: txn.description,
          merchantName: txn.merchantName,
          amount: txn.amount,
          isoCurrencyCode: currency,
          date: txn.date,
          authorizedDate: txn.authorizedDate,
          pending: txn.pending,
          categoryPrimary: txn.categoryPrimary,
          categoryDetailed: txn.categoryDetailed,
          categoryConfidence: txn.categoryConfidence,
          paymentChannel: txn.paymentChannel,
          transactionCode: txn.transactionCode,
          checkNumber: txn.checkNumber,
          locationCity: txn.locationCity,
          locationRegion: txn.locationRegion,
          locationCountry: txn.locationCountry,
          runningBalance: txn.runningBalance,
          originalDescription: txn.description,
          paymentMetaJson,
          source: "statement",
          statementUploadId: upload.id,
          updatedAt: new Date(),
        })
        .returning({ id: transactions.id });

      keptIds.add(inserted.id);
      insertedCount += 1;
    }

    // Drop leftover twins from older/bad parses for this account in the period.
    if (balance.balanced !== false) {
      const periodStart = parsed.statementPeriodStart;
      const periodEnd = parsed.statementPeriodEnd;
      const leftovers = softPool.filter((row) => !keptIds.has(row.id));

      for (const row of leftovers) {
        const inPeriod =
          (!periodStart || row.date >= periodStart || (row.authorizedDate ?? "") >= periodStart) &&
          (!periodEnd || row.date <= periodEnd || (row.authorizedDate ?? "") <= periodEnd);

        const matchesParsed = parsed.transactions.some((txn) => {
          if (txn.amount !== row.amount) return false;
          return Boolean(
            findSoftTwin([row], {
              description: txn.description,
              amount: txn.amount,
              date: txn.date,
              authorizedDate: txn.authorizedDate,
            }),
          );
        });

        if (!inPeriod && !matchesParsed) continue;
        if (!matchesParsed && row.statementUploadId === upload.id) continue;

        if (matchesParsed || (inPeriod && row.statementUploadId !== upload.id)) {
          await db.delete(transactions).where(eq(transactions.id, row.id));
          removedTwinCount += 1;
        }
      }
    }

    const transactionCount = insertedCount + updatedCount;

    await db
      .update(statementUploads)
      .set({
        status: "completed",
        institutionName: parsed.institutionName,
        accountName: parsed.accountName,
        accountMask: parsed.accountMask,
        currency,
        transactionCount,
        insertedCount,
        updatedCount,
        skippedCount: updatedCount,
        statementPeriodStart: parsed.statementPeriodStart,
        statementPeriodEnd: parsed.statementPeriodEnd,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
        totalDebits: parsed.totalDebits,
        totalCredits: parsed.totalCredits,
        transactionSum: balance.transactionSum,
        computedClosing: balance.computedClosing,
        balanceDelta: balance.delta,
        balanceOk: balance.balanced,
        completedAt: new Date(),
        error:
          balance.balanced === false
            ? `Imported with balance mismatch (delta ${balance.delta}).`
            : null,
      })
      .where(eq(statementUploads.id, upload.id));

    let hygiene: ImportHygieneSummary | undefined;
    let enrichment: ImportEnrichmentSummary | undefined;

    if (params.skipPostProcess) {
      return {
        ok: true,
        uploadId: upload.id,
        transactionCount,
        insertedCount,
        updatedCount,
        skippedCount: updatedCount,
        removedTwinCount,
        duplicateFile: false,
        institutionName: parsed.institutionName,
        accountName: parsed.accountName,
        pageCount: ocr.pageCount,
        statementPeriodStart: parsed.statementPeriodStart,
        statementPeriodEnd: parsed.statementPeriodEnd,
        openingBalance: balance.openingBalance,
        closingBalance: balance.closingBalance,
        transactionSum: balance.transactionSum,
        computedClosing: balance.computedClosing,
        balanceDelta: balance.delta,
        balanceOk: balance.balanced,
      };
    }

    const hygieneStage = await runStage("statements:hygiene", () =>
      runCategoryHygienePipeline(),
    );
    if (hygieneStage.ok) {
      const value = hygieneStage.value;
      hygiene = {
        ok: value.warnings.length === 0,
        consolidateMerges: value.consolidate.mergesApplied,
        rulesMatched: value.rules.matched,
        aiUpdated: value.aiClean.updated,
        error: value.warnings[0],
      };
    } else {
      hygiene = {
        ok: false,
        consolidateMerges: 0,
        rulesMatched: 0,
        aiUpdated: 0,
        error: hygieneStage.error,
      };
    }

    const enrichmentStage = await runStage("statements:enrichment", () =>
      enrichTransactionsForUpload(upload.id),
    );
    if (enrichmentStage.ok) {
      const value = enrichmentStage.value;
      enrichment = value.ok
        ? {
            ok: true,
            enriched: value.enriched,
            failed: value.failed,
            error:
              value.failed > 0
                ? `${value.failed} merchants missed enrichment`
                : undefined,
          }
        : {
            ok: false,
            enriched: 0,
            failed: 0,
            error: value.error,
          };
    } else {
      enrichment = {
        ok: false,
        enriched: 0,
        failed: 0,
        error: enrichmentStage.error,
      };
    }

    if (hygiene?.ok) {
      console.info(
        `[statements] hygiene merges=${hygiene.consolidateMerges} rules=${hygiene.rulesMatched} ai=${hygiene.aiUpdated}`,
      );
    } else if (hygiene?.error) {
      console.warn(`[statements] hygiene skipped: ${hygiene.error}`);
    }

    if (enrichment?.ok) {
      console.info(
        `[statements] enrichment enriched=${enrichment.enriched} failed=${enrichment.failed}`,
      );
    } else if (enrichment?.error) {
      console.warn(`[statements] enrichment skipped: ${enrichment.error}`);
    }

    return {
      ok: true,
      uploadId: upload.id,
      transactionCount,
      insertedCount,
      updatedCount,
      skippedCount: updatedCount,
      removedTwinCount,
      duplicateFile: false,
      institutionName: parsed.institutionName,
      accountName: parsed.accountName,
      pageCount: ocr.pageCount,
      statementPeriodStart: parsed.statementPeriodStart,
      statementPeriodEnd: parsed.statementPeriodEnd,
      openingBalance: balance.openingBalance,
      closingBalance: balance.closingBalance,
      transactionSum: balance.transactionSum,
      computedClosing: balance.computedClosing,
      balanceDelta: balance.delta,
      balanceOk: balance.balanced,
      hygiene,
      enrichment,
    };
  } catch (error) {
    const message = errorMessage(error, "Statement import failed");

    await db
      .update(statementUploads)
      .set({
        status: "failed",
        error: message,
        completedAt: new Date(),
      })
      .where(eq(statementUploads.id, upload.id));

    return {
      ok: false,
      status: 500,
      error: message,
    };
  }
}

export type { StatementBalanceCheck };
