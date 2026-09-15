import type { PaymentFrequency } from "./paymentFrequency";

export const RATE_TYPES = [
  { value: "fixed", label: "Fixed" },
  { value: "variable", label: "Variable" },
] as const;

export type RateType = (typeof RATE_TYPES)[number]["value"];

const RATE_TYPE_SET = new Set<string>(RATE_TYPES.map((item) => item.value));

export function isRateType(value: string): value is RateType {
  return RATE_TYPE_SET.has(value);
}

export function normalizeRateType(value: string | null | undefined): RateType {
  if (!value) return "fixed";
  const trimmed = value.trim().toLowerCase();
  return isRateType(trimmed) ? trimmed : "fixed";
}

/** Common consumer loan kinds tracked in personal-finance apps. */
export const LOAN_TYPES = [
  {
    value: "auto",
    label: "Auto loan",
    subtype: "auto loan",
    namePlaceholder: "e.g. Car loan",
    collateralLabel: "Vehicle (optional)",
    collateralPlaceholder: "2021 Lexus IS",
    showCollateral: true,
    defaultFrequency: "biweekly" as PaymentFrequency,
    defaultRateType: "fixed" as RateType,
  },
  {
    value: "mortgage",
    label: "Mortgage",
    subtype: "mortgage",
    namePlaceholder: "e.g. Home mortgage",
    collateralLabel: "Property (optional)",
    collateralPlaceholder: "123 Main St",
    showCollateral: true,
    defaultFrequency: "monthly" as PaymentFrequency,
    defaultRateType: "fixed" as RateType,
  },
  {
    value: "student",
    label: "Student loan",
    subtype: "student loan",
    namePlaceholder: "e.g. Student loan",
    collateralLabel: "School / program (optional)",
    collateralPlaceholder: "U of T, Computer Science",
    showCollateral: true,
    defaultFrequency: "monthly" as PaymentFrequency,
    defaultRateType: "fixed" as RateType,
  },
  {
    value: "personal",
    label: "Personal loan",
    subtype: "personal loan",
    namePlaceholder: "e.g. Debt consolidation",
    collateralLabel: "Note (optional)",
    collateralPlaceholder: "What this loan covers",
    showCollateral: true,
    defaultFrequency: "monthly" as PaymentFrequency,
    defaultRateType: "fixed" as RateType,
  },
  {
    value: "heloc",
    label: "HELOC",
    subtype: "heloc",
    namePlaceholder: "e.g. Home equity line",
    collateralLabel: "Property (optional)",
    collateralPlaceholder: "123 Main St",
    showCollateral: true,
    defaultFrequency: "monthly" as PaymentFrequency,
    defaultRateType: "variable" as RateType,
  },
  {
    value: "other",
    label: "Other loan",
    subtype: "loan",
    namePlaceholder: "e.g. Boat loan",
    collateralLabel: "Asset / note (optional)",
    collateralPlaceholder: "What secures or describes this loan",
    showCollateral: true,
    defaultFrequency: "monthly" as PaymentFrequency,
    defaultRateType: "fixed" as RateType,
  },
] as const;

export type LoanType = (typeof LOAN_TYPES)[number]["value"];

const LOAN_TYPE_SET = new Set<string>(LOAN_TYPES.map((item) => item.value));

export function isLoanType(value: string): value is LoanType {
  return LOAN_TYPE_SET.has(value);
}

/** Existing car-loan rows default to auto when loanType is missing. */
export function normalizeLoanType(value: string | null | undefined): LoanType {
  if (!value) return "auto";
  const trimmed = value.trim().toLowerCase();
  return isLoanType(trimmed) ? trimmed : "other";
}

export function loanTypeMeta(type: LoanType) {
  return LOAN_TYPES.find((item) => item.value === type)!;
}

export function officialLoanName(
  name: string,
  loanType: LoanType,
  collateralLabel: string | null,
): string {
  const typeLabel = loanTypeMeta(loanType).label;
  if (collateralLabel) return `${collateralLabel}: ${typeLabel}`;
  return name;
}

export function formatLoanRate(
  annualRate: number,
  rateType: RateType,
  aprDisclosed?: number | null,
): string {
  const pct = `${(annualRate * 100).toFixed(2)}%`;
  const kind = rateType === "variable" ? "Variable" : "Fixed";
  const apr =
    aprDisclosed != null ? ` (APR ${(aprDisclosed * 100).toFixed(2)}%)` : "";
  return `${kind} ${pct}${apr}`;
}
