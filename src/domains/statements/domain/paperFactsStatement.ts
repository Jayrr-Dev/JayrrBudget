import { z } from "zod";
import {
  parsedStatementSchema,
  type ParsedStatement,
} from "@/domains/statements/domain/parsedStatement";

/**
 * Paper-facts-only statement extract.
 * AI reads OCR into rows - no merchant clean, categories, channel, or txn codes.
 */
export const paperFactsTransactionSchema = z.object({
  date: z.string().describe("Posted/transaction date YYYY-MM-DD"),
  authorizedDate: z
    .string()
    .nullable()
    .describe("Purchase/authorization date YYYY-MM-DD if different"),
  description: z
    .string()
    .describe("Full original statement line description (minus OCR dingbats)"),
  amount: z
    .number()
    .describe(
      "Positive = money out (purchase/debit/fee/PAD). Negative = money in (payment/credit/refund/deposit).",
    ),
  pending: z.boolean().default(false),
  locationCity: z.string().nullable(),
  locationRegion: z.string().nullable(),
  locationCountry: z.string().nullable(),
});

export const paperFactsStatementSchema = parsedStatementSchema
  .omit({ transactions: true })
  .extend({
    transactions: z.array(paperFactsTransactionSchema),
  });

export type PaperFactsStatement = z.infer<typeof paperFactsStatementSchema>;
export type PaperFactsTransaction = z.infer<typeof paperFactsTransactionSchema>;

/** Lift paper facts into the full ParsedStatement shape with AI fields left empty. */
export function paperFactsToParsed(
  paper: PaperFactsStatement,
): ParsedStatement {
  return {
    ...paper,
    transactions: paper.transactions.map((txn) => ({
      date: txn.date,
      authorizedDate: txn.authorizedDate,
      description: txn.description,
      merchantName: null,
      amount: txn.amount,
      section: null,
      category: null,
      subcategory: null,
      paymentChannel: null,
      transactionCode: "other" as const,
      pending: txn.pending,
      runningBalance: null,
      locationCity: txn.locationCity,
      locationRegion: txn.locationRegion,
      locationCountry: txn.locationCountry,
      checkNumber: null,
      referenceNumber: null,
      foreignAmount: null,
      foreignCurrency: null,
    })),
  };
}
