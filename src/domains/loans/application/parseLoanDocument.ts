import type { ConvexHttpClient } from "convex/browser";
import {
  LOAN_DOCUMENT_STEPS,
  type LoanDocumentProgress,
} from "@/domains/loans/domain/loanDocumentProgress";
import type { ParseLoanDocumentResult } from "@/domains/loans/domain/loanDocumentResult";
import {
  isMistralConfigured,
  ocrDocument,
} from "@/domains/statements/infrastructure/mistralOcr";
import {
  isOpenRouterConfigured,
  parseLoanDocumentFields,
} from "@/domains/loans/infrastructure/openRouterParseLoan";
import { isOcrDocumentFilename } from "@/domains/statements/domain/ocrDocumentTypes";
import { statementFileHash } from "@/domains/statements/domain/parsedStatement";
import { api } from "@/shared/convex/httpClient";
import { errorMessage } from "@/shared/lib/error-message";

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
 * 2. Mistral OCR (PDF or photo)
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

  if (!isOpenRouterConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "OPENROUTER_NOT_CONFIGURED",
      error: "Missing OPENROUTER_API_KEY. Add it to .env.local.",
    };
  }

  if (!isOcrDocumentFilename(params.filename)) {
    return {
      ok: false,
      status: 400,
      error: "Only PDF or image files (PNG, JPG, WEBP, AVIF, HEIC) are supported.",
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
    const persistMode = params.persistMode ?? "convex";

    if (persistMode === "convex") {
      const existing = await params.client.query(
        api.loanDocuments.findCompletedByFileHash,
        { fileHash },
      );
      if (existing) {
        emitProgress(params.onProgress, "done");
        return existing;
      }
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

    if (persistMode === "vault") {
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
    }

    const saved = await params.client.mutation(api.loanDocuments.saveParsed, {
      filename: params.filename,
      fileHash,
      pageCount: ocr.pageCount,
      ocrMarkdown: ocr.markdown,
      fields,
    });

    emitProgress(params.onProgress, "done");
    return {
      ok: true,
      filename: params.filename,
      fileHash,
      pageCount: ocr.pageCount,
      fields,
      ocrMarkdown: ocr.markdown,
      uploadId: saved.uploadId,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: errorMessage(error, "Loan document parse failed"),
    };
  }
}
