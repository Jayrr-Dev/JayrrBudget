import { tool, type InferUITool } from "ai";
import { z } from "zod";

/**
 * Client-side when the vault is on: Piggy asks the browser to parse a loan
 * document and register encrypted loan terms. No `execute` in that mode.
 */
export const REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME =
  "register_loan_from_document";

export const registerLoanOverridesSchema = z
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
    txnDescriptionLookup: z.string().nullable().optional(),
    matchMerchantClean: z.string().nullable().optional(),
  })
  .describe("Values the user gave that beat what the document says");

export const registerLoanFromDocumentInputSchema = z.object({
  documentIndex: z
    .number()
    .int()
    .min(1)
    .describe("1-based index from the attached-document note"),
  overrides: registerLoanOverridesSchema.optional(),
});

export const registerLoanFromDocumentOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  needs: z.array(z.string()).optional(),
  accountId: z.string().optional(),
  name: z.string().optional(),
  loanType: z.string().optional(),
  principalStart: z.number().optional(),
  annualRatePct: z.number().optional(),
  paymentAmount: z.number().optional(),
  paymentCount: z.number().optional(),
  firstPaymentDate: z.string().optional(),
  parsed: z.record(z.string(), z.unknown()).optional(),
});

export type RegisterLoanFromDocumentInput = z.infer<
  typeof registerLoanFromDocumentInputSchema
>;
export type RegisterLoanFromDocumentOutput = z.infer<
  typeof registerLoanFromDocumentOutputSchema
>;

export const REGISTER_LOAN_FROM_DOCUMENT_DESCRIPTION = [
  "Read an attached loan contract, disclosure, or loan statement and register it as a lending account (mortgage, auto, student, personal, HELOC, other).",
  "Parses the terms from the document, then applies any overrides the user gave. If required terms are still missing it returns needs: [...] and the parsed values; ask the user with ask_user, then call again with overrides.",
  "Rates are percents (7.99). Dates are YYYY-MM-DD. The browser may encrypt the loan into the vault.",
].join(" ");

export const registerLoanFromDocumentClientTool = tool({
  description: REGISTER_LOAN_FROM_DOCUMENT_DESCRIPTION,
  inputSchema: registerLoanFromDocumentInputSchema,
  outputSchema: registerLoanFromDocumentOutputSchema,
});

export type RegisterLoanFromDocumentUITool = InferUITool<
  typeof registerLoanFromDocumentClientTool
>;
