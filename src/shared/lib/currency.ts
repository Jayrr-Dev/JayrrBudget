export const DEFAULT_CURRENCY = "CAD";

const CURRENCY_ALIASES: Record<string, string> = {
  "$": "CAD",
  "CA$": "CAD",
  "C$": "CAD",
  "CANADIAN DOLLAR": "CAD",
  "CANADIAN DOLLARS": "CAD",
  "US$": "USD",
  "U$": "USD",
  "UNITED STATES DOLLAR": "USD",
  "UNITED STATES DOLLARS": "USD",
  "AMERICAN DOLLAR": "USD",
  "AMERICAN DOLLARS": "USD",
  "€": "EUR",
  EURO: "EUR",
  EUROS: "EUR",
  "£": "GBP",
  "BRITISH POUND": "GBP",
  "BRITISH POUNDS": "GBP",
  "¥": "JPY",
  YEN: "JPY",
  YUAN: "CNY",
};

/** Keep the stored value compatible with Intl while accepting common statement labels. */
export function normalizeCurrencyCode(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return DEFAULT_CURRENCY;
  return CURRENCY_ALIASES[normalized] ?? normalized;
}

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
