import {
  LOAN_DOCUMENT_STEPS,
  type LoanDocumentProgress,
} from "@/domains/loans/domain/loanDocumentProgress";
import type { ParseLoanDocumentResult } from "@/domains/loans/domain/loanDocumentResult";
import { parseLoanDocumentFields } from "@/domains/loans/infrastructure/openRouterParseLoan";
import { isOcrDocumentFilename } from "@/domains/statements/domain/ocrDocumentTypes";
import { statementFileHash } from "@/domains/statements/domain/parsedStatement";
import {
  isMistralConfigured,
  ocrDocument,
} from "@/domains/statements/infrastructure/mistralOcr";
import { OPENROUTER_NOT_CONFIGURED } from "@/shared/ai/openRouter";
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { checkAiCall } from "@/shared/ai/enforceAiCall.server";
import { resolveOpenRouterApiKey } from "@/shared/ai/resolveOpenRouter.server";
import { errorMessage } from "@/shared/lib/error-message";
import type { ConvexHttpClient } from "convex/browser";

function emitProgress(
  onProgress: ((progress: LoanDocumentProgress) => void) | undefined,
  step: LoanDocumentProgress["step"],
) {
  const meta = LOAN_DOCUMENT_STEPS[step];
  onProgress?.({ step, percent: meta.percent, label: meta.label });
}

/**
 * Loan document parse (statement-import fundamentals, no ledger writes on vault):
 * 1. SHA-256 of file bytes
 * 2. OCR (server, or local markdown from the browser)
 * 3. OpenRouter structured loan terms
 * 4. convex = persist OCR + fields; vault = return payload for client encrypt
 */
export async function parseLoanDocument(params: {
  filename: string;
  bytes: Buffer;
  client: ConvexHttpClient;
  mimeType?: string | null;
  persistMode?: "convex" | "vault";
  clientOcr?: { markdown: string; pageCount: number } | null;
  onProgress?: (progress: LoanDocumentProgress) => void;
}): Promise<ParseLoanDocumentResult> {
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
    parseLoanDocumentWithKey(params),
  );
}

type ParseLoanParams = {
  filename: string;
  bytes: Buffer;
  client: ConvexHttpClient;
  mimeType?: string | null;
  persistMode?: "convex" | "vault";
  clientOcr?: { markdown: string; pageCount: number } | null;
  onProgress?: (progress: LoanDocumentProgress) => void;
};

async function parseLoanDocumentWithKey(
  params: ParseLoanParams,
): Promise<ParseLoanDocumentResult> {
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
    const persistMode = params.persistMode ?? "vault";
    if (persistMode !== "vault") {
      return {
        ok: false,
        status: 410,
        error:
          "Plaintext loan document save is retired. Unlock the private ledger.",
      };
    }

    emitProgress(params.onProgress, "ocr");
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

    if (!ocr.markdown.trim()) {
      return {
        ok: false,
        status: 422,
        error: "OCR returned no readable text from this PDF.",
      };
    }

    emitProgress(params.onProgress, "parse");
    const fields = await parseLoanDocumentFields(ocr.markdown, {
      sourceHint: params.filename,
    });

    emitProgress(params.onProgress, "done");
    return {
      ok: true,
      filename: params.filename,
      fileHash,
      pageCount: ocr.pageCount,
      fields,
      ocrMarkdown: ocr.markdown,
      uploadId: 0,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: errorMessage(error, "Loan document parse failed"),
    };
  }
}
