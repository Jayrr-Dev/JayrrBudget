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
import type { ImportBankStatementResult } from "@/domains/statements/domain/importResult";
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
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { checkAiCall } from "@/shared/ai/enforceAiCall.server";
import { OPENROUTER_NOT_CONFIGURED } from "@/shared/ai/openRouter";
import { resolveOpenRouterApiKey } from "@/shared/ai/resolveOpenRouter.server";
import { api } from "@/shared/convex/httpClient";
import { normalizeCurrencyCode } from "@/shared/lib/currency";
import { errorMessage } from "@/shared/lib/error-message";
import type { ConvexHttpClient } from "convex/browser";

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
 * Classification is a separate step (Classify on Transactions).
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

  const loaded = await resolveOpenRouterApiKey(params.client);
  if (!loaded) {
    return {
      ok: false,
      status: 503,
      code: "OPENROUTER_NOT_CONFIGURED",
      error: OPENROUTER_NOT_CONFIGURED,
    };
  }

  const gate = await checkAiCall(params.client, {
    billedTo: loaded.billedTo,
    usesPlatformOcr: !params.clientOcr,
  });
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status,
      code: gate.code,
      error: gate.error,
    };
  }

  return runMeteredOpenRouter(params.client, loaded, () =>
    importBankStatementWithKey(params),
  );
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
    const persistMode = params.persistMode ?? "vault";
    if (persistMode !== "vault") {
      return {
        ok: false,
        status: 410,
        error:
          "Plaintext statement import is retired. Unlock the private ledger and import into the vault.",
      };
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
        transactions,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: errorMessage(error, "Statement import failed"),
    };
  }
}
