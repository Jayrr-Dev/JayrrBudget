import {
  DEFAULT_CURRENCY,
  isCurrencyCode,
  normalizeCurrencyCode,
} from "@/shared/lib/currency";

export type MoneyParts = {
  symbol: string;
  number: string;
  negative: boolean;
};

function moneyFormatter(code: string, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    ...(compact
      ? { notation: "compact" as const, maximumFractionDigits: 1 }
      : {}),
  });
}

function partsFromAbs(
  abs: number,
  code: string,
  compact: boolean,
): MoneyParts | null {
  if (!isCurrencyCode(code)) {
    return {
      symbol: code,
      number: compact
        ? abs.toLocaleString("en-US", {
            notation: "compact",
            maximumFractionDigits: 1,
          })
        : abs.toFixed(2),
      negative: false,
    };
  }
  try {
    const formatted = moneyFormatter(code, compact).formatToParts(abs);
    const symbol = formatted
      .filter((part) => part.type === "currency")
      .map((part) => part.value)
      .join("");
    const number = formatted
      .filter(
        (part) =>
          part.type !== "currency" &&
          part.type !== "minusSign" &&
          part.type !== "plusSign",
      )
      .map((part) => part.value)
      .join("");
    return { symbol, number, negative: false };
  } catch {
    return null;
  }
}

export function formatMoneyParts(
  amount: number | null | undefined,
  currency = DEFAULT_CURRENCY,
  compact = false,
): MoneyParts | null {
  if (amount == null || Number.isNaN(amount)) return null;
  if (Math.abs(amount) < 0.005) return null;
  const code = normalizeCurrencyCode(currency);
  const parsed = partsFromAbs(Math.abs(amount), code, compact);
  if (!parsed) {
    return {
      symbol: code,
      number: Math.abs(amount).toFixed(2),
      negative: amount < 0,
    };
  }
  return { ...parsed, negative: amount < 0 };
}

/** Plain-text money: "CA$ 12.50" (magnitude only). Tables should use MoneyText. */
export function formatMoney(
  amount: number | null | undefined,
  currency = DEFAULT_CURRENCY,
) {
  const parts = formatMoneyParts(amount, currency);
  if (!parts) return "-";
  return `${parts.symbol} ${parts.number}`;
}

export function gapAfterCurrencySymbol(formatted: string) {
  return formatted.replace(/(\p{Sc}|[A-Z]{1,3}\$)\s*(?=\d)/u, "$1 ");
}
