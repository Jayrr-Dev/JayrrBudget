import { DEFAULT_CURRENCY, isCurrencyCode, normalizeCurrencyCode } from "@/shared/lib/currency";

export function formatMoney(
  amount: number | null | undefined,
  currency = DEFAULT_CURRENCY,
) {
  if (amount == null || Number.isNaN(amount)) return "-";

  const code = normalizeCurrencyCode(currency);
  if (!isCurrencyCode(code)) return `${code} ${amount.toFixed(2)}`;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** Ledger amounts: positive = money out, negative = money in. */
export function formatLedgerSpend(amount: number, currency = DEFAULT_CURRENCY) {
  const signed = amount > 0 ? -amount : Math.abs(amount);
  return formatMoney(signed, currency);
}
