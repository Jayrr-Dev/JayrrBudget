import {
  IMPORT_STATEMENT_DOCUMENT_DESCRIPTION,
  importStatementDocumentClientTool,
  importStatementDocumentInputSchema,
} from "@/domains/ledger-ai/domain/importStatementDocumentTool";
import { formatDocumentBytes } from "@/domains/ledger-ai/domain/piggyDocuments";
import { parseLoanDocument } from "@/domains/loans/application/parseLoanDocument";
import { importBankStatement } from "@/domains/statements/application/importBankStatement";
import { isOcrDocumentFilename } from "@/domains/statements/domain/ocrDocumentTypes";
import {
  isMistralConfigured,
  ocrDocument,
} from "@/domains/statements/infrastructure/mistralOcr";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
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
const LOAN_REQUIRED = [
  "name",
  "principalStart",
  "annualRatePct",
  "paymentAmount",
  "paymentCount",
  "firstPaymentDate",
] as const;

const documentIndexSchema =
  importStatementDocumentInputSchema.shape.documentIndex;

const loanOverridesSchema = z
  .object({
    name: z.string().min(1).optional(),
    loanType: z
      .enum(["auto", "mortgage", "student", "personal", "heloc", "other"])
      .optional(),
    rateType: z.enum(["fixed", "variable"]).optional(),
    vehicleLabel: z.string().nullable().optional(),
    principalStart: z.number().positive().optional(),
    annualRatePct: z
      .number()
      .min(0)
      .optional()
      .describe("Percent, 7.99 not 0.0799"),
    paymentAmount: z.number().positive().optional(),
    paymentFrequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .optional(),
    paymentCount: z.number().int().min(1).optional(),
    firstPaymentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    matchMerchantClean: z.string().nullable().optional(),
  })
  .describe("Values the user gave that beat what the document says");

/**
 * Tools that let Piggy read and file the documents attached to this request.
 * Reads work everywhere; imports only when plaintext ledger writes are on.
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

  if (!allowLedgerWrites) {
    return { ...readTools, import_statement_document: importStatement };
  }

  return {
    ...readTools,
    import_statement_document: importStatement,

    register_loan_from_document: tool({
      description: [
        "Read an attached loan contract, disclosure, or loan statement and register it as a lending account (mortgage, auto, student, personal, HELOC, other).",
        "Parses the terms from the document, then applies any overrides the user gave. If required terms are still missing it returns needs: [...] and the parsed values; ask the user with ask_user, then call again with overrides.",
        "Rates are percents (7.99). Dates are YYYY-MM-DD.",
      ].join(" "),
      inputSchema: z.object({
        documentIndex: documentIndexSchema,
        overrides: loanOverridesSchema.optional(),
      }),
      execute: async ({ documentIndex, overrides }) => {
        const doc = pick(documentIndex);
        const parsed = await parseLoanDocument({
          filename: doc.filename,
          bytes: doc.bytes,
          mimeType: doc.mediaType,
          client,
          persistMode: "convex",
        });
        if (!parsed.ok) return { ok: false as const, error: parsed.error };

        const terms = { ...parsed.fields, ...stripUndefined(overrides ?? {}) };
        const needs = LOAN_REQUIRED.filter((key) => {
          const value = terms[key];
          return value === null || value === undefined || value === "";
        });
        if (needs.length > 0) {
          return {
            ok: false as const,
            needs,
            parsed: terms,
            error: `Missing loan terms: ${needs.join(", ")}. Ask the user, then retry with overrides.`,
          };
        }

        try {
          const created = await client.mutation(
            api.dashboard.createCustomLoan,
            {
              name: terms.name!,
              loanType: terms.loanType,
              rateType: terms.rateType,
              vehicleLabel: terms.vehicleLabel ?? null,
              principalStart: terms.principalStart!,
              annualRate: terms.annualRatePct! / 100,
              paymentAmount: terms.paymentAmount!,
              paymentFrequency: terms.paymentFrequency,
              paymentCount: terms.paymentCount!,
              firstPaymentDate: terms.firstPaymentDate!,
              matchMerchantClean: terms.matchMerchantClean ?? null,
            },
          );
          await client.mutation(api.loanDocuments.linkToAccount, {
            fileHash: parsed.fileHash,
            accountId: created.accountId,
          });
          await invalidateConvexUserCache();
          return {
            ok: true as const,
            accountId: created.accountId,
            name: terms.name,
            loanType: terms.loanType,
            rateType: terms.rateType,
            principalStart: terms.principalStart,
            annualRatePct: terms.annualRatePct,
            paymentAmount: terms.paymentAmount,
            paymentFrequency: terms.paymentFrequency,
            paymentCount: terms.paymentCount,
            firstPaymentDate: terms.firstPaymentDate,
          };
        } catch (error) {
          return {
            ok: false as const,
            parsed: terms,
            error: errorMessage(error, "Could not register the loan"),
          };
        }
      },
    }),
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
