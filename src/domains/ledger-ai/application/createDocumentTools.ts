import {
  importStatementDocumentClientTool,
  importStatementDocumentInputSchema,
} from "@/domains/ledger-ai/domain/importStatementDocumentTool";
import { registerLoanFromDocumentClientTool } from "@/domains/ledger-ai/domain/registerLoanFromDocumentTool";
import { formatDocumentBytes } from "@/domains/ledger-ai/domain/piggyDocuments";
import { isOcrDocumentFilename } from "@/domains/statements/domain/ocrDocumentTypes";
import {
  isMistralConfigured,
  ocrDocument,
} from "@/domains/statements/infrastructure/mistralOcr";
import { errorMessage } from "@/shared/lib/error-message";
import { tool } from "ai";
import { z } from "zod";
import type { PiggyDocument } from "./extractPiggyDocuments";

export {
  extractPiggyDocuments,
  type PiggyDocument,
} from "./extractPiggyDocuments";

const MAX_READ_CHARS = 16_000;

const documentIndexSchema =
  importStatementDocumentInputSchema.shape.documentIndex;

/**
 * Tools that let Piggy read and file the documents attached to this request.
 * Statement import and loan registration always run in the browser (vault).
 */
export function createDocumentTools({
  documents,
}: {
  documents: PiggyDocument[];
}) {
  if (documents.length === 0) return {};

  const ocrCache = new Map<
    number,
    Promise<{ markdown: string; pageCount: number }>
  >();
  const pick = (index: number) => {
    const doc = documents.find((d) => d.index === index);
    if (!doc) {
      throw new Error(
        `No attached document #${index}. Attached: ${documents.map((d) => `#${d.index} ${d.filename}`).join(", ")}.`,
      );
    }
    if (!isOcrDocumentFilename(doc.filename)) {
      throw new Error(
        `"${doc.filename}" is not a PDF or image. Jev can only read PDF, PNG, JPG, WEBP, AVIF, or HEIC.`,
      );
    }
    return doc;
  };
  const ocr = (doc: PiggyDocument) => {
    let hit = ocrCache.get(doc.index);
    if (!hit) {
      hit = ocrDocument({
        filename: doc.filename,
        bytes: doc.bytes,
        mimeType: doc.mediaType,
      });
      ocrCache.set(doc.index, hit);
    }
    return hit;
  };

  const readTools = {
    list_documents: tool({
      description:
        "List the files the user attached to their latest message, with index, name, type, and size.",
      inputSchema: z.object({}),
      execute: async () =>
        documents.map((doc) => ({
          documentIndex: doc.index,
          filename: doc.filename,
          mediaType: doc.mediaType,
          size: formatDocumentBytes(doc.bytes.byteLength),
        })),
    }),

    read_document: tool({
      description: [
        "OCR an attached PDF or image and return its text so you can decide what it is (bank statement, loan contract, receipt, other) or answer questions about it.",
        "Prefer import_statement_document or register_loan_from_document when the user wants it filed; they OCR on their own.",
      ].join(" "),
      inputSchema: z.object({
        documentIndex: documentIndexSchema,
        maxChars: z.number().int().min(500).max(MAX_READ_CHARS).optional(),
      }),
      execute: async ({ documentIndex, maxChars }) => {
        const doc = pick(documentIndex);
        if (!isMistralConfigured()) {
          return {
            ok: false as const,
            error: "Document OCR is not configured on this server.",
          };
        }
        try {
          const result = await ocr(doc);
          const limit = maxChars ?? 8_000;
          const text = result.markdown.trim();
          return {
            ok: true as const,
            filename: doc.filename,
            pageCount: result.pageCount,
            truncated: text.length > limit,
            text: text.slice(0, limit),
          };
        } catch (error) {
          return {
            ok: false as const,
            error: errorMessage(error, "OCR failed"),
          };
        }
      },
    }),
  };

  return {
    ...readTools,
    import_statement_document: importStatementDocumentClientTool,
    register_loan_from_document: registerLoanFromDocumentClientTool,
  };
}
