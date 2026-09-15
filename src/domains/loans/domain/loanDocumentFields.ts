import { z } from "zod";
import {
  isLoanType,
  isRateType,
  normalizeLoanType,
  normalizeRateType,
  type LoanType,
  type RateType,
} from "@/domains/loans/domain/loanTypes";
import {
  isPaymentFrequency,
  normalizePaymentFrequency,
  type PaymentFrequency,
} from "@/domains/loans/domain/paymentFrequency";

/** Structured loan terms extracted from a contract / disclosure PDF. */
export const loanDocumentFieldsSchema = z.object({
  name: z
    .string()
    .nullable()
    .describe("Short loan label, e.g. lender + product. Null if unclear."),
  loanType: z
    .enum(["auto", "mortgage", "student", "personal", "heloc", "other"])
    .describe("Best-fit consumer loan kind from the document."),
  rateType: z
    .enum(["fixed", "variable"])
    .describe("Fixed vs variable / floating rate."),
  vehicleLabel: z
    .string()
    .nullable()
    .describe(
      "Collateral or asset note: vehicle, property address, school, etc. Null if none.",
    ),
  principalStart: z
    .number()
    .nullable()
    .describe(
      "Starting / current principal to amortize from (amount still owed preferred over original if both appear).",
    ),
  annualRatePct: z
    .number()
    .nullable()
    .describe("Annual interest rate as a percent, e.g. 7.99 not 0.0799."),
  paymentAmount: z
    .number()
    .nullable()
    .describe("Regular payment amount per frequency period."),
  paymentFrequency: z
    .enum(["weekly", "biweekly", "semimonthly", "monthly"])
    .describe("How often the payment is due."),
  paymentCount: z
    .number()
    .nullable()
    .describe(
      "Total remaining scheduled payments from firstPaymentDate (not payments already made).",
    ),
  firstPaymentDate: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD for the next or first payment on the schedule."),
  matchMerchantClean: z
    .string()
    .nullable()
    .describe(
      "PAD / auto-debit merchant name as it might appear on a bank statement. Null if unknown.",
    ),
  institutionName: z
    .string()
    .nullable()
    .describe("Lender or institution name when present."),
});

export type LoanDocumentFields = z.infer<typeof loanDocumentFieldsSchema>;

export type LoanFormFill = {
  name: string;
  loanType: LoanType;
  rateType: RateType;
  vehicleLabel: string;
  principalStart: string;
  annualRatePct: string;
  paymentAmount: string;
  paymentFrequency: PaymentFrequency;
  paymentCount: string;
  firstPaymentDate: string;
  matchMerchantClean: string;
};

function numOrEmpty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

/** Map AI parse result into Add loan form string fields. */
export function loanFieldsToFormFill(
  fields: LoanDocumentFields,
): Partial<LoanFormFill> {
  const loanType = isLoanType(fields.loanType)
    ? fields.loanType
    : normalizeLoanType(fields.loanType);
  const rateType = isRateType(fields.rateType)
    ? fields.rateType
    : normalizeRateType(fields.rateType);
  const paymentFrequency = isPaymentFrequency(fields.paymentFrequency)
    ? fields.paymentFrequency
    : normalizePaymentFrequency(fields.paymentFrequency);

  return {
    name: fields.name?.trim() || "",
    loanType,
    rateType,
    vehicleLabel: fields.vehicleLabel?.trim() || "",
    principalStart: numOrEmpty(fields.principalStart),
    annualRatePct: numOrEmpty(fields.annualRatePct),
    paymentAmount: numOrEmpty(fields.paymentAmount),
    paymentFrequency,
    paymentCount: numOrEmpty(
      fields.paymentCount != null ? Math.floor(fields.paymentCount) : null,
    ),
    firstPaymentDate: fields.firstPaymentDate?.trim() || "",
    matchMerchantClean: fields.matchMerchantClean?.trim() || "",
  };
}
