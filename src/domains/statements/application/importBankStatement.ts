import {
  normalizeStatementAccountType,
  statementTypeToLedgerFields,
} from "@/domains/dashboard/domain/accountCategory";
import {
  checkStatementBalance,
  dedupeParsedTransactions,
} from "@/domains/statements/application/balanceStatement";
import { polishPaperFactsStatement } from "@/domains/statements/application/polishParsedStatement";
import {
  STATEMENT_IMPORT_STEPS,
  type StatementImportProgress,
} from "@/domains/statements/domain/importProgress";
import type {
  ImportBankStatementResult,
  ImportBankStatementSuccess,
} from "@/domains/statements/domain/importResult";
import { isOcrDocumentFilename } from "@/domains/statements/domain/ocrDocumentTypes";
import {
  manualAccountId,
  statementFileHash,
  statementOccurrenceKey,
  statementTransactionId,
} from "@/domains/statements/domain/parsedStatement";
import {
  isMistralConfigured,
  ocrDocument,
} from "@/domains/statements/infrastructure/mistralOcr";
import { parseStatementPaperFacts } from "@/domains/statements/infrastructure/openRouterParse";
import {
  OPENROUTER_NOT_CONFIGURED,
  runWithOpenRouterKey,
} from "@/shared/ai/openRouter";
import { resolveOpenRouterApiKey } from "@/shared/ai/resolveOpenRouter.server";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { normalizeCurrencyCode } from "@/shared/lib/currency";
import { errorMessage } from "@/shared/lib/error-message";
import type { ConvexHttpClient } from "convex/browser";
import {
  categorizeStatement,
  labelDescriptionGroups,
} from "./categorizeStatement";

export type {
  ImportBankStatementResult,
  ImportBankStatementSuccess,
  ImportEnrichmentSummary,
  ImportHygieneSummary,
} from "@/domains/statements/domain/importResult";

function emitProgress(
  onProgress: ((progress: StatementImportProgress) => void) | undefined,
  step: StatementImportProgress["step"],
) {
  const meta = STATEMENT_IMPORT_STEPS[step];
  onProgress?.({ step, percent: meta.percent, label: meta.label });
}

/**
 * Slim statement import:
 * 0. SHA-256 of PDF bytes - skip OCR/parse if already imported
 * 1. OCR (server, or local markdown from the browser)
 * 2. AI paper-facts parse (dates/amounts/description/locations + account meta)
 * 3. Write transactions to Convex
 *
 * 4. Reuse saved categorization, then classify unfamiliar descriptions.
 */
export async function importBankStatement(params: {
  filename: string;
  bytes: Buffer;
  client: ConvexHttpClient;
  sourceHint?: string;
  mimeType?: string | null;
  /** convex = write plaintext ledger; vault = return facts for client encrypt. */
  persistMode?: "convex" | "vault";
  /** Browser Tesseract scan; skips server OCR when present. */
  clientOcr?: { markdown: string; pageCount: number } | null;
  onProgress?: (progress: StatementImportProgress) => void;
}): Promise<ImportBankStatementResult> {
  if (!params.clientOcr && !isMistralConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "MISTRAL_NOT_CONFIGURED",
      error: "Missing MISTRAL_API_KEY. Add it to .env.local.",
    };
  }

  const apiKey = await resolveOpenRouterApiKey(params.client);
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: "OPENROUTER_NOT_CONFIGURED",
      error: OPENROUTER_NOT_CONFIGURED,
    };
  }

  return runWithOpenRouterKey(apiKey, () => importBankStatementWithKey(params));
}

async function importBankStatementWithKey(
  params: Parameters<typeof importBankStatement>[0],
): Promise<ImportBankStatementResult> {
  if (!isOcrDocumentFilename(params.filename)) {
    return {
      ok: false,
      status: 400,
      error:
        "Only PDF or image files (PNG, JPG, WEBP, AVIF, HEIC) are supported.",
    };
  }

  if (params.bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "Empty file." };
  }

  if (params.bytes.byteLength > 20 * 1024 * 1024) {
    return {
      ok: false,
      status: 400,
      error: "File must be 20MB or smaller.",
    };
  }

  try {
    emitProgress(params.onProgress, "receive");
    const fileHash = statementFileHash(params.bytes);

    // Same file bytes already imported → skip Mistral OCR + OpenRouter parse.
    const persistMode = params.persistMode ?? "convex";
    const existing =
      persistMode === "vault"
        ? null
        : await params.client.query(api.statements.findCompletedByFileHash, {
            fileHash,
          });
    if (existing) {
      emitProgress(params.onProgress, "done");
      console.info(
        `[statements] duplicate fileHash=${fileHash.slice(0, 12)}… skip OCR`,
      );
      return existing as ImportBankStatementSuccess;
    }

    emitProgress(params.onProgress, "ocr");
    const ocrStarted = Date.now();
    const ocr = params.clientOcr
      ? {
          markdown: params.clientOcr.markdown,
          pageCount: params.clientOcr.pageCount,
        }
      : await ocrDocument({
          filename: params.filename,
          bytes: params.bytes,
          mimeType: params.mimeType,
        });
    console.info(
      `[statements] OCR pages=${ocr.pageCount} in ${Date.now() - ocrStarted}ms${
        params.clientOcr ? " (local)" : ""
      }`,
    );

    if (!ocr.markdown.trim()) {
      return {
        ok: false,
        status: 422,
        error: "OCR returned no readable text from this PDF.",
      };
    }

    emitProgress(params.onProgress, "parse");
    const sourceHint = params.sourceHint?.trim() || params.filename;
    // Owner-scoped rules: authenticated Convex client only returns this user's list.
    // Injected only into paper-facts PDF parse below - not canvas/enrichment/other AI.
    const aiRules = await params.client.query(api.aiRules.get, {});
    const rawParsed = await parseStatementPaperFacts(ocr.markdown, {
      sourceHint,
      userRules: aiRules.rules,
    });
    const parsed = polishPaperFactsStatement(rawParsed, {
      ocrMarkdown: ocr.markdown,
      sourceHint,
      dedupe: dedupeParsedTransactions,
    });
    const balance = checkStatementBalance(parsed);

    const normalizedAccountType = normalizeStatementAccountType(
      parsed.accountType,
    );
    const ledgerFields = statementTypeToLedgerFields(normalizedAccountType);
    const accountId = manualAccountId({
      institutionName: parsed.institutionName,
      accountMask: parsed.accountMask,
      accountType: normalizedAccountType,
    });
    const currency = normalizeCurrencyCode(parsed.currency);

    const occurrence = new Map<string, number>();
    const transactions = parsed.transactions.map((txn) => {
      const occKey = statementOccurrenceKey(
        txn.date,
        txn.description,
        txn.amount,
      );
      const occurrenceIndex = occurrence.get(occKey) ?? 0;
      occurrence.set(occKey, occurrenceIndex + 1);

      return {
        transactionId: statementTransactionId(
          accountId,
          txn.date,
          txn.description,
          txn.amount,
          occurrenceIndex,
        ),
        posted: txn.date,
        authorized: txn.authorizedDate,
        description: txn.description,
        amount: txn.amount,
        pending: txn.pending,
        city: txn.locationCity,
        region: txn.locationRegion,
        country: txn.locationCountry,
        foreignAmount: txn.foreignAmount,
        foreignCurrency: txn.foreignCurrency
          ? normalizeCurrencyCode(txn.foreignCurrency)
          : null,
        exchangeRate: txn.exchangeRate,
      };
    });

    emitProgress(params.onProgress, "save");
    if (persistMode === "vault") {
      emitProgress(params.onProgress, "categorize");
      let categorization;
      let labeledTxns = transactions;
      try {
        const labeled = await labelDescriptionGroups(
          params.client,
          transactions,
        );
        categorization = labeled.summary;
        const byId = new Map(
          labeled.labeled.map((row) => [row.transactionId, row]),
        );
        labeledTxns = transactions.map((txn) => {
          const hit = byId.get(txn.transactionId);
          if (!hit) return txn;
          return {
            ...txn,
            merchantClean: hit.profile.merchant,
            sectionName: hit.section,
            categoryName: hit.category,
            subcategoryName: hit.subcategory,
            spreadName: hit.profile.spread,
            transactionTypeName: hit.profile.transactionType,
            txnCode: hit.profile.txnCode,
            channel: hit.profile.channel,
            tagNames: hit.profile.tags ?? [],
          };
        });
      } catch (error) {
        categorization = {
          ok: false,
          cached: 0,
          ai: 0,
          pending: transactions.length,
          error: errorMessage(error, "Categorization failed"),
        };
      }
      emitProgress(params.onProgress, "done");
      return {
        ok: true,
        uploadId: 0,
        filename: params.filename,
        fileHash,
        transactionCount: transactions.length,
        insertedCount: transactions.length,
        updatedCount: 0,
        skippedCount: 0,
        removedTwinCount: 0,
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
        categorization,
        vaultPayload: {
          accountId,
          accountName: parsed.accountName,
          accountType: ledgerFields.type,
          accountSubtype: ledgerFields.subtype,
          accountMask: parsed.accountMask,
          currency,
          openingBalance: balance.openingBalance,
          closingBalance: balance.closingBalance,
          ocrMarkdown: ocr.markdown,
          transactions: labeledTxns,
        },
      };
    }

    const result = await params.client.mutation(
      api.statements.importPaperFacts,
      {
        filename: params.filename,
        fileHash,
        pageCount: ocr.pageCount,
        institutionName: parsed.institutionName,
        accountName: parsed.accountName,
        accountMask: parsed.accountMask,
        currency,
        accountId,
        accountType: ledgerFields.type,
        accountSubtype: ledgerFields.subtype,
        statementPeriodStart: parsed.statementPeriodStart,
        statementPeriodEnd: parsed.statementPeriodEnd,
        openingBalance: balance.openingBalance,
        closingBalance: balance.closingBalance,
        totalDebits: parsed.totalDebits,
        totalCredits: parsed.totalCredits,
        transactionSum: balance.transactionSum,
        computedClosing: balance.computedClosing,
        balanceDelta: balance.delta,
        balanceOk: balance.balanced,
        ocrMarkdown: ocr.markdown,
        transactions,
      },
    );
    await invalidateConvexUserCache();

    emitProgress(params.onProgress, "categorize");
    let categorization;
    try {
      categorization = await categorizeStatement(
        params.client,
        result.uploadId,
      );
    } catch (error) {
      categorization = {
        ok: false,
        cached: 0,
        ai: 0,
        pending: result.transactionCount,
        error: errorMessage(error, "Categorization failed"),
      };
    }
    emitProgress(params.onProgress, "done");
    return { ...result, categorization } as ImportBankStatementSuccess;
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: errorMessage(error, "Statement import failed"),
    };
  }
}
