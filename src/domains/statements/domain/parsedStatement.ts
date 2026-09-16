import { createHash } from "node:crypto";
import { z } from "zod";

export const MANUAL_INSTITUTION_ID = "manual-statements";

export const parsedStatementSchema = z.object({
  institutionName: z.string().nullable(),
  accountName: z.string().nullable(),
  accountMask: z
    .string()
    .nullable()
    .describe(
      "Last 4 of the product: card PAN for Visa/MC, account number for chequing/LOC. Never a customer number.",
    ),
  accountType: z
    .enum([
      "chequing",
      "checking",
      "savings",
      "credit",
      "credit_card",
      "lending",
      "line_of_credit",
      "other",
    ])
    .default("other")
    .describe(
      "Dashboard category: chequing/checking, savings, credit/credit_card, lending/line_of_credit, or other (TFSA/business/etc).",
    ),
  currency: z
    .string()
    .trim()
    .min(1)
    .default("CAD")
    .describe(
      "Statement currency as its ISO 4217 three-letter code, for example CAD, USD, EUR, GBP, JPY, or AUD.",
    ),
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
  totalDebits: z.number().nullable(),
  totalCredits: z.number().nullable(),
  transactions: z.array(
    z.object({
      date: z.string().describe("Posted/transaction date YYYY-MM-DD"),
      authorizedDate: z
        .string()
        .nullable()
        .describe("Purchase/authorization date YYYY-MM-DD if different"),
      description: z
        .string()
        .describe("Full original statement line description"),
      merchantName: z
        .string()
        .nullable()
        .describe(
          "Short brand/payee only (Aldo, Airbnb). Never city, FX amount, currency, @ rate, *refs, or websites.",
        ),
      amount: z
        .number()
        .describe(
          "Positive = money out (purchase/debit/fee/PAD), including chequing withdrawals. Negative = money in (payment/credit/refund/deposit).",
        ),
      section: z
        .string()
        .nullable()
        .describe(
          "Top spend tree node. Prefer an EXISTING section from the prompt list (Lifestyle, Transport, Technology, Transfers, Income, Finance, Health, Home).",
        ),
      category: z
        .string()
        .nullable()
        .describe(
          "Mid spend tree node under section. Prefer an EXISTING category from the prompt list.",
        ),
      subcategory: z
        .string()
        .nullable()
        .describe(
          "Fine spend label (leaf). MUST reuse an EXISTING subcategory from the prompt list when it matches (e.g. Gas Stations, not Gas). Avoid plural/singular twins and paraphrases.",
        ),
      paymentChannel: z
        .enum(["online", "in store", "other"])
        .nullable()
        .default("other"),
      transactionCode: z
        .enum([
          "purchase",
          "payment",
          "refund",
          "fee",
          "interest",
          "cash_advance",
          "transfer",
          "subscription",
          "statement",
          "other",
        ])
        .default("other"),
      pending: z.boolean().default(false),
      runningBalance: z.number().nullable(),
      locationCity: z.string().nullable(),
      locationRegion: z.string().nullable(),
      locationCountry: z.string().nullable(),
      checkNumber: z.string().nullable(),
      referenceNumber: z.string().nullable(),
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
          "ISO 4217 code of the foreign charge (PHP, USD, EUR). Null when the line is already in statement currency.",
        ),
      exchangeRate: z
        .number()
        .nullable()
        .describe(
          "FX rate printed on the line (e.g. 0.024 from `PHP @ 0.024`, or 1.42 from `USD 12.00 @ 1.42`). Null when absent.",
        ),
    }),
  ),
});

export type ParsedStatement = z.infer<typeof parsedStatementSchema>;

/** Collapse OCR noise so re-uploads of the same charge match. */
export function normalizeStatementText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function statementFileHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Stable ledger account for a card/bank product (not per upload). */
export function manualAccountId(params: {
  institutionName: string | null;
  accountMask: string | null;
  accountType: string;
}) {
  const institution =
    normalizeStatementText(params.institutionName || "unknown")
      .replace(/\s+/g, "-")
      .slice(0, 40) || "unknown";
  const mask =
    String(params.accountMask || "")
      .replace(/\D/g, "")
      .slice(-4) || "xxxx";
  const type = params.accountType || "other";
  return `manual-${institution}-${type}-${mask}`;
}

/**
 * Content fingerprint for a posted line.
 * occurrenceIndex separates same-day same-amount same-merchant charges.
 */
export function statementTransactionId(
  accountId: string,
  date: string,
  description: string,
  amount: number,
  occurrenceIndex: number,
) {
  const digest = createHash("sha256")
    .update(
      `${accountId}|${date}|${normalizeStatementText(description)}|${amount}|${occurrenceIndex}`,
    )
    .digest("hex")
    .slice(0, 24);

  return `stmt_${digest}`;
}

export function statementOccurrenceKey(
  date: string,
  description: string,
  amount: number,
) {
  return `${date}|${amount}|${normalizeStatementText(description)}`;
}

/** Soft match key ignoring post vs trans date (amount + description only). */
export function statementSoftMatchKey(description: string, amount: number) {
  return `${amount}|${normalizeStatementText(description)}`;
}
