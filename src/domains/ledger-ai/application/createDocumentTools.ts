import {
  IMPORT_STATEMENT_DOCUMENT_DESCRIPTION,
  importStatementDocumentClientTool,
  importStatementDocumentInputSchema,
} from "@/domains/ledger-ai/domain/importStatementDocumentTool";
import { registerLoanFromDocumentClientTool } from "@/domains/ledger-ai/domain/registerLoanFromDocumentTool";
import { formatDocumentBytes } from "@/domains/ledger-ai/domain/piggyDocuments";
import { importBankStatement } from "@/domains/statements/application/importBankStatement";
import { isOcrDocumentFilename } from "@/domains/statements/domain/ocrDocumentTypes";
import {
  isMistralConfigured,
  ocrDocument,
} from "@/domains/statements/infrastructure/mistralOcr";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { errorMessage } from "@/shared/lib/error-message";
import { tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
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
 * Reads work everywhere; statement import uses Convex execute only when
 * plaintext writes are on, otherwise the browser encrypts. Loan registration
 * always runs in the browser (private ledger).
 */
export function createDocumentTools({
  client,
  documents,
  allowLedgerWrites,
}: {
  client: ConvexHttpClient;
  documents: PiggyDocument[];
  allowLedgerWrites: boolean;
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
        `"${doc.filename}" is not a PDF or image. Piggy can only read PDF, PNG, JPG, WEBP, AVIF, or HEIC.`,
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

  const importStatement = allowLedgerWrites
    ? tool({
        description: IMPORT_STATEMENT_DOCUMENT_DESCRIPTION,
        inputSchema: z.object({ documentIndex: documentIndexSchema }),
        execute: async ({ documentIndex }) => {
          const doc = pick(documentIndex);
          const result = await importBankStatement({
            filename: doc.filename,
            bytes: doc.bytes,
            mimeType: doc.mediaType,
            client,
            persistMode: "convex",
          });
          if (!result.ok) return { ok: false as const, error: result.error };
          await invalidateConvexUserCache();
          return {
            ok: true as const,
            filename: result.filename,
            duplicateFile: result.duplicateFile,
            institutionName: result.institutionName,
            accountName: result.accountName,
            statementPeriodStart: result.statementPeriodStart,
            statementPeriodEnd: result.statementPeriodEnd,
            transactionCount: result.transactionCount,
            insertedCount: result.insertedCount,
            updatedCount: result.updatedCount,
            skippedCount: result.skippedCount,
            balanceOk: result.balanceOk,
            categorization: result.categorization ?? null,
          };
        },
      })
    : importStatementDocumentClientTool;

  return {
    ...readTools,
    import_statement_document: importStatement,
    register_loan_from_document: registerLoanFromDocumentClientTool,
  };
}
