import { normalizeCurrencyCode } from "@/shared/lib/currency";
import { fillFxGapsFromDescription } from "@/domains/statements/domain/extractFxFromDescription";
import type { ParsedStatement } from "@/domains/statements/domain/parsedStatement";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function centsMatch(a: number, b: number) {
  return Math.abs(a - b) <= 0.02;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

/**
 * Statement amount must be home currency.
 * A line that booked the peso or dollar face value is multiplied by the printed rate.
 * A line with no rate borrows the median rate of the same currency on this statement.
 * A line that already matches face × rate is left alone.
 */
export function convertForeignFaceAmounts(
  parsed: ParsedStatement,
): ParsedStatement {
  const home = normalizeCurrencyCode(parsed.currency);
  const filled = parsed.transactions.map(fillFxGapsFromDescription);

  const ratesByCode = new Map<string, number[]>();
  for (const txn of filled) {
    const code = txn.foreignCurrency
      ? normalizeCurrencyCode(txn.foreignCurrency)
      : "";
    if (!code || code === home) continue;
    if (txn.exchangeRate == null || txn.exchangeRate <= 0) continue;
    const list = ratesByCode.get(code) ?? [];
    list.push(txn.exchangeRate);
    ratesByCode.set(code, list);
  }

  const borrowedRate = new Map<string, number>();
  for (const [code, rates] of ratesByCode) {
    const mid = median(rates);
    if (mid != null && mid > 0) borrowedRate.set(code, mid);
  }

  return {
    ...parsed,
    transactions: filled.map((txn) => {
      const code = txn.foreignCurrency
        ? normalizeCurrencyCode(txn.foreignCurrency)
        : "";
      const foreign = txn.foreignAmount;
      if (!code || code === home || foreign == null || foreign === 0) {
        return txn;
      }

      const printedRate =
        txn.exchangeRate != null && txn.exchangeRate > 0
          ? txn.exchangeRate
          : null;
      const rate = printedRate ?? borrowedRate.get(code) ?? null;
      if (rate == null) return txn;

      const converted = round2(Math.abs(foreign) * rate);
      const sign = txn.amount < 0 ? -1 : 1;
      const signed = round2(sign * converted);
      const current = Math.abs(txn.amount);

      if (centsMatch(current, converted)) {
        return { ...txn, foreignCurrency: code };
      }

      const bookedFace = centsMatch(current, Math.abs(foreign));
      if (printedRate == null && !bookedFace) return txn;

      return {
        ...txn,
        foreignCurrency: code,
        amount: signed,
      };
    }),
  };
}
