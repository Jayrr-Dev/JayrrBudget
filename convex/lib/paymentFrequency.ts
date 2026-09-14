export const PAYMENT_FREQUENCIES = [
  { value: "weekly", label: "Weekly", days: 7, periodsPerYear: 52 },
  { value: "biweekly", label: "Biweekly", days: 14, periodsPerYear: 26 },
  { value: "semimonthly", label: "Semi-monthly", days: 15, periodsPerYear: 24 },
  { value: "monthly", label: "Monthly", days: null, periodsPerYear: 12 },
] as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number]["value"];

const FREQUENCY_SET = new Set<string>(
  PAYMENT_FREQUENCIES.map((item) => item.value),
);

export function isPaymentFrequency(value: string): value is PaymentFrequency {
  return FREQUENCY_SET.has(value);
}

export function normalizePaymentFrequency(value: string): PaymentFrequency {
  const trimmed = value.trim().toLowerCase();
  return isPaymentFrequency(trimmed) ? trimmed : "biweekly";
}

export function frequencyMeta(frequency: PaymentFrequency) {
  return PAYMENT_FREQUENCIES.find((item) => item.value === frequency)!;
}

export function periodRate(
  annualRate: number,
  frequency: PaymentFrequency,
): number {
  return annualRate / frequencyMeta(frequency).periodsPerYear;
}
