import {
  parsedStatementSchema,
  type ParsedStatement,
} from "@/domains/statements/domain/parsedStatement";
import { z } from "zod";

/**
 * Paper-facts-only statement extract.
 * AI reads OCR into rows - no merchant clean, categories, channel, or txn codes.
 */
const paperFactsCoreTransactionSchema = z.object({
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
});

const paperFactsLocationFields = z.object({
  locationCity: z.string().nullable(),
  locationRegion: z.string().nullable(),
  locationCountry: z.string().nullable(),
});

const paperFactsFxFields = z.object({
  foreignAmount: z
    .number()
    .nullable()
    .describe(
      "Original foreign charge size when printed (e.g. 12280 from `12,280.00 PHP @ 0.024`). Null when domestic.",
    ),
  foreignCurrency: z
    .string()
    .nullable()
    .describe(
      "ISO 4217 code of the foreign charge (PHP, USD, EUR). Null when already in statement currency.",
    ),
  exchangeRate: z
    .number()
    .nullable()
    .describe(
      "FX rate printed on the line (e.g. 0.024 or 1.42). Null when absent.",
    ),
});

/** Full row shape: core facts + location + FX. */
export const paperFactsTransactionSchema = paperFactsCoreTransactionSchema
  .extend(paperFactsLocationFields.shape)
  .extend(paperFactsFxFields.shape);

/** Account header only. FX and location are filled after parse, not by the model. */
export const paperFactsMetaSchema = z.object({
  institutionName: z.string().nullable(),
  accountName: z.string().nullable(),
  accountMask: z
    .string()
    .nullable()
    .describe(
      "Last 4 of the product: card PAN for Visa/MC, account number for chequing/LOC.",
    ),
  accountType: parsedStatementSchema.shape.accountType,
  currency: parsedStatementSchema.shape.currency,
  statementPeriodStart: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD statement period start"),
  statementPeriodEnd: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD statement period end"),
  openingBalance: z.number().nullable(),
  closingBalance: z.number().nullable(),
});

export const paperFactsStatementSchema = paperFactsMetaSchema.extend({
  transactions: z.array(paperFactsTransactionSchema),
});

export type PaperFactsStatement = z.infer<typeof paperFactsStatementSchema>;
export type PaperFactsTransaction = z.infer<typeof paperFactsTransactionSchema>;

export type PaperFactsFieldSet = {
  location: boolean;
  fx: boolean;
};

/**
 * Row schema with only the optional field groups the OCR actually shows.
 * Fewer output fields = fewer tokens = faster extraction.
 */
export function paperFactsTransactionSchemaFor(
  fields: PaperFactsFieldSet,
): z.ZodType<PaperFactsTransactionInput> {
  if (fields.location && fields.fx) return paperFactsTransactionSchema;
  if (fields.location) {
    return paperFactsCoreTransactionSchema.extend(
      paperFactsLocationFields.shape,
    );
  }
  if (fields.fx) {
    return paperFactsCoreTransactionSchema.extend(paperFactsFxFields.shape);
  }
  return paperFactsCoreTransactionSchema;
}

/** Core row with the optional groups possibly absent. */
export type PaperFactsTransactionInput = z.infer<
  typeof paperFactsCoreTransactionSchema
> &
  Partial<z.infer<typeof paperFactsLocationFields>> &
  Partial<z.infer<typeof paperFactsFxFields>>;

export type PaperFactsStatementInput = z.infer<typeof paperFactsMetaSchema> & {
  transactions: PaperFactsTransactionInput[];
};

const FX_RATE = /@\s*\d/;
/** Common non-CAD currencies printed on Canadian card lines (`USD 12.00`, `12,280.00 PHP`). */
const FOREIGN_CURRENCIES =
  "USD|EUR|GBP|PHP|MXN|JPY|AUD|NZD|CHF|INR|CNY|HKD|SGD|KRW|THB|VND|IDR|MYR|BRL|ARS|CLP|COP|PEN|ZAR|NGN|KES|EGP|TRY|PLN|CZK|HUF|SEK|NOK|DKK|ISK|AED|SAR|QAR|ILS|TWD|PKR|BDT|LKR|NPR";
const FOREIGN_CODE = new RegExp(
  `(?:\\b(?:${FOREIGN_CURRENCIES})\\s*\\$?\\d)|(?:\\d\\s*(?:${FOREIGN_CURRENCIES})\\b)`,
);
/** `MERCHANT CITY AB` style card descriptors (CA provinces + US states). */
const REGION_CODE =
  /\b[A-Z][A-Za-z.'&-]{2,}\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b(?![A-Za-z])/;

/** Decide which optional row groups to request from the OCR text. */
export function detectPaperFactsFields(
  ocrMarkdown: string,
): PaperFactsFieldSet {
  return {
    fx: FX_RATE.test(ocrMarkdown) || FOREIGN_CODE.test(ocrMarkdown),
    location: REGION_CODE.test(ocrMarkdown),
  };
}

/** Lift paper facts into the full ParsedStatement shape with AI fields left empty. */
export function paperFactsToParsed(
  paper: PaperFactsStatementInput,
): ParsedStatement {
  return {
    ...paper,
    totalDebits: null,
    totalCredits: null,
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
      locationCity: txn.locationCity ?? null,
      locationRegion: txn.locationRegion ?? null,
      locationCountry: txn.locationCountry ?? null,
      checkNumber: null,
      referenceNumber: null,
      foreignAmount: txn.foreignAmount ?? null,
      foreignCurrency: txn.foreignCurrency ?? null,
      exchangeRate: txn.exchangeRate ?? null,
    })),
  };
}
