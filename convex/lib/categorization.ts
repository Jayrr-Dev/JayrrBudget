import { v } from "convex/values";

export const profileValidator = v.object({
  merchant: v.string(),
  pathKey: v.string(),
  spread: v.string(),
  transactionType: v.string(),
  txnCode: v.string(),
  channel: v.string(),
});

export type CategoryProfile = {
  merchant: string;
  pathKey: string;
  spread: string;
  transactionType: string;
  txnCode: string;
  channel: string;
};

export function normalizedLabel(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function taxonomyKey(section: string, category: string, subcategory: string | null) {
  return JSON.stringify([section, category, subcategory ?? ""].map(normalizedLabel));
}

// Only discard explicitly labelled references. Digits in brand names and
// purchase/refund/payment words carry meaning and must remain distinct.
export function descriptionKey(description: string, amount: number) {
  const text = normalizedLabel(description)
    .replace(/\b(?:ref(?:erence)?|auth(?:orization)?)\s*[:#]\s*[a-z0-9-]+\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return JSON.stringify(["v1", amount < 0 ? "in" : amount > 0 ? "out" : "zero", text]);
}

export function isCategorized(row: {
  merchantClean: string | null; section: string | null; category: string | null;
  spread: string | null; transactionType: string | null; txnCode: string | null;
  channel: string | null;
}) {
  return Boolean(row.merchantClean && row.section && row.category && row.spread &&
    row.transactionType && row.txnCode && row.channel);
}
