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
import {
  insertLedgerLine,
  updateLedgerLine,
} from "@/domains/statements/application/persistLedgerLine";
import { runStage } from "@/shared/ai/runStage";
import { errorMessage } from "@/shared/lib/error-message";
import { getDb } from "@/shared/db";
import { toMajor } from "@/shared/db/money";
import {
  accounts,
  institutions,
  statementUploads,
  transactionAmounts,
  transactionBankCategories,
  transactionDates,
  transactionEnrichment,
  transactionLocations,
  transactionPaymentRefs,
  transactions,
} from "@/shared/db/schema";
import type {
  ImportBankStatementResult,
  ImportEnrichmentSummary,
  ImportHygieneSummary,
} from "@/domains/statements/domain/importResult";

async function pragmaBusyTimeout(
  client: { execute: (sql: string) => Promise<unknown> },
) {
  await client.execute("PRAGMA busy_timeout = 60000");
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
  description: string;
  merchantClean: string | null;
  amountMajor: number;
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
    if (row.amountMajor !== params.amount) return false;
    const rowKey = statementSoftMatchKey(row.description, row.amountMajor);
    const merchantKey = row.merchantClean
      ? statementSoftMatchKey(row.merchantClean, row.amountMajor)
      : null;
    if (rowKey !== wantKey && merchantKey !== wantKey) {
      // Allow loose merchant overlap when descriptions share a long stem.
      const a = normalizeStatementText(params.description);
      const b = normalizeStatementText(row.description);
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
  await pragmaBusyTimeout(db.$client);
  await ensureManualLedger();

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

    try {
      if (existingAccount[0]) {
        await db
          .update(accounts)
          .set(accountValues)
          .where(eq(accounts.accountId, accountId));
      } else {
        await db.insert(accounts).values(accountValues);
      }
    } catch (error) {
      const msg = errorMessage(error);
      if (!/SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(msg)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const again = await db
        .select()
        .from(accounts)
        .where(eq(accounts.accountId, accountId))
        .limit(1);
      if (again[0]) {
        await db
          .update(accounts)
          .set(accountValues)
          .where(eq(accounts.accountId, accountId));
      } else {
        await db.insert(accounts).values(accountValues);
      }
    }

    const existingOnAccount = await db
      .select({
        id: transactions.id,
        transactionId: transactions.transactionId,
        description: transactions.description,
        merchantClean: transactionEnrichment.merchantClean,
        amountMinor: transactionAmounts.amountMinor,
        postedDate: transactionDates.postedDate,
        authorizedDate: transactionDates.authorizedDate,
        statementUploadId: transactions.statementUploadId,
      })
      .from(transactions)
      .innerJoin(
        transactionAmounts,
        eq(transactionAmounts.transactionId, transactions.id),
      )
      .innerJoin(
        transactionDates,
        eq(transactionDates.transactionId, transactions.id),
      )
      .leftJoin(
        transactionEnrichment,
        eq(transactionEnrichment.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.source, "statement"),
        ),
      );

    const softPool: SoftMatchRow[] = existingOnAccount.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      description: row.description,
      merchantClean: row.merchantClean,
      amountMajor: toMajor(row.amountMinor),
      date: row.postedDate,
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

      const existingTxn = await db
        .select({
          id: transactions.id,
          authorizedDate: transactionDates.authorizedDate,
          runningBalanceMinor: transactionAmounts.runningBalanceMinor,
          merchantClean: transactionEnrichment.merchantClean,
          categoryPrimary: transactionBankCategories.categoryPrimary,
          categoryDetailed: transactionBankCategories.categoryDetailed,
          categoryConfidence: transactionBankCategories.categoryConfidence,
          paymentChannel: transactionPaymentRefs.paymentChannel,
          transactionCode: transactionPaymentRefs.transactionCode,
          locationCity: transactionLocations.city,
          locationRegion: transactionLocations.region,
          locationCountry: transactionLocations.country,
          checkNumber: transactionPaymentRefs.checkNumber,
          referenceNumber: transactionPaymentRefs.referenceNumber,
          foreignAmountMinor: transactionPaymentRefs.foreignAmountMinor,
          foreignCurrency: transactionPaymentRefs.foreignCurrency,
          statementUploadId: transactions.statementUploadId,
        })
        .from(transactions)
        .leftJoin(
          transactionAmounts,
          eq(transactionAmounts.transactionId, transactions.id),
        )
        .leftJoin(
          transactionDates,
          eq(transactionDates.transactionId, transactions.id),
        )
        .leftJoin(
          transactionEnrichment,
          eq(transactionEnrichment.transactionId, transactions.id),
        )
        .leftJoin(
          transactionBankCategories,
          eq(transactionBankCategories.transactionId, transactions.id),
        )
        .leftJoin(
          transactionLocations,
          eq(transactionLocations.transactionId, transactions.id),
        )
        .leftJoin(
          transactionPaymentRefs,
          eq(transactionPaymentRefs.transactionId, transactions.id),
        )
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

      const existing = existingTxn[0];

      if (targetId != null) {
        if (softTwin) claimedSoftIds.add(softTwin.id);

        await updateLedgerLine(targetId, {
          externalId,
          accountId,
          description: txn.description,
          pending: txn.pending,
          statementUploadId: upload.id,
          amount: txn.amount,
          currencyCode: currency,
          runningBalance:
            txn.runningBalance ??
            (existing?.runningBalanceMinor != null
              ? toMajor(existing.runningBalanceMinor)
              : null),
          postedDate: txn.date,
          authorizedDate:
            txn.authorizedDate ??
            existing?.authorizedDate ??
            softTwin?.authorizedDate ??
            null,
          locationCity: txn.locationCity ?? existing?.locationCity ?? null,
          locationRegion: txn.locationRegion ?? existing?.locationRegion ?? null,
          locationCountry: txn.locationCountry ?? existing?.locationCountry ?? null,
          checkNumber: txn.checkNumber ?? existing?.checkNumber ?? null,
          referenceNumber: txn.referenceNumber ?? existing?.referenceNumber ?? null,
          transactionCode: txn.transactionCode ?? existing?.transactionCode ?? null,
          paymentChannel: txn.paymentChannel ?? existing?.paymentChannel ?? null,
          foreignAmount:
            txn.foreignAmount ??
            (existing?.foreignAmountMinor != null
              ? toMajor(existing.foreignAmountMinor)
              : null),
          foreignCurrency: txn.foreignCurrency ?? existing?.foreignCurrency ?? null,
          categoryPrimary: txn.categoryPrimary ?? existing?.categoryPrimary ?? null,
          categoryDetailed: txn.categoryDetailed ?? existing?.categoryDetailed ?? null,
          categoryConfidence:
            txn.categoryConfidence ?? existing?.categoryConfidence ?? null,
          merchantClean:
            txn.merchantName ??
            existing?.merchantClean ??
            softTwin?.merchantClean ??
            null,
        });

        keptIds.add(targetId);
        updatedCount += 1;
        continue;
      }

      const newId = await insertLedgerLine({
        externalId,
        accountId,
        description: txn.description,
        pending: txn.pending,
        statementUploadId: upload.id,
        amount: txn.amount,
        currencyCode: currency,
        runningBalance: txn.runningBalance,
        postedDate: txn.date,
        authorizedDate: txn.authorizedDate,
        locationCity: txn.locationCity,
        locationRegion: txn.locationRegion,
        locationCountry: txn.locationCountry,
        checkNumber: txn.checkNumber,
        referenceNumber: txn.referenceNumber,
        transactionCode: txn.transactionCode,
        paymentChannel: txn.paymentChannel,
        foreignAmount: txn.foreignAmount,
        foreignCurrency: txn.foreignCurrency,
        categoryPrimary: txn.categoryPrimary,
        categoryDetailed: txn.categoryDetailed,
        categoryConfidence: txn.categoryConfidence,
        merchantClean: txn.merchantName,
      });

      keptIds.add(newId);
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
          if (txn.amount !== row.amountMajor) return false;
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
        accountId,
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
