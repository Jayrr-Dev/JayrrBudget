import { normalizeCurrencyCode } from "@/shared/lib/currency";

export type ExtractedFx = {
  foreignAmount: number | null;
  foreignCurrency: string | null;
  exchangeRate: number | null;
};

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)`;
const CODE = String.raw`([A-Za-z]{3})`;
const RATE = String.raw`(\d+(?:\.\d+)?)`;

/** `12,280.00 PHP @ 0.024` */
const AMOUNT_THEN_CODE = new RegExp(
  `${AMOUNT}\\s*${CODE}\\s*@\\s*${RATE}`,
  "i",
);

/** `USD 12.00 @ 1.42` */
const CODE_THEN_AMOUNT = new RegExp(
  `\\b${CODE}\\s+${AMOUNT}\\s*@\\s*${RATE}`,
  "i",
);

function parseAmount(raw: string) {
  return Number(raw.replace(/,/g, ""));
}

/**
 * Pull FX fields from common card-descriptor shapes printed on statements.
 * Returns nulls when no FX note is present.
 */
export function extractFxFromDescription(description: string): ExtractedFx {
  const empty: ExtractedFx = {
    foreignAmount: null,
    foreignCurrency: null,
    exchangeRate: null,
  };
  if (!description.trim()) return empty;

  const amountFirst = description.match(AMOUNT_THEN_CODE);
  if (amountFirst) {
    const amount = parseAmount(amountFirst[1] ?? "");
    const code = normalizeCurrencyCode(amountFirst[2]);
    const rate = Number(amountFirst[3]);
    if (!Number.isFinite(amount) || !Number.isFinite(rate)) return empty;
    return {
      foreignAmount: amount,
      foreignCurrency: code,
      exchangeRate: rate,
    };
  }

  const codeFirst = description.match(CODE_THEN_AMOUNT);
  if (codeFirst) {
    const code = normalizeCurrencyCode(codeFirst[1]);
    const amount = parseAmount(codeFirst[2] ?? "");
    const rate = Number(codeFirst[3]);
    if (!Number.isFinite(amount) || !Number.isFinite(rate)) return empty;
    return {
      foreignAmount: amount,
      foreignCurrency: code,
      exchangeRate: rate,
    };
  }

  return empty;
}

/** Fill missing FX fields from description; keep AI values when already set. */
export function fillFxGapsFromDescription<
  T extends {
    description: string;
    foreignAmount?: number | null;
    foreignCurrency?: string | null;
    exchangeRate?: number | null;
  },
>(txn: T): T {
  const fx = extractFxFromDescription(txn.description);
  return {
    ...txn,
    foreignAmount: txn.foreignAmount ?? fx.foreignAmount,
    foreignCurrency: txn.foreignCurrency ?? fx.foreignCurrency,
    exchangeRate: txn.exchangeRate ?? fx.exchangeRate,
  };
}
