import { v } from "convex/values";
import { cleanMerchantDescriptor } from "./cleanMerchantDescriptor";

export const profileValidator = v.object({
  merchant: v.string(),
  pathKey: v.string(),
  spread: v.string(),
  transactionType: v.string(),
  txnCode: v.string(),
  channel: v.string(),
  tags: v.optional(v.array(v.string())),
});

export type CategoryProfile = {
  merchant: string;
  pathKey: string;
  spread: string;
  transactionType: string;
  txnCode: string;
  channel: string;
  tags?: string[];
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

/** Shop plus direction. Order codes and store numbers collapse to one rule. */
export function merchantRuleKey(description: string, amount: number) {
  const cleaned = cleanMerchantDescriptor(description)?.trim();
  const text = normalizedLabel(cleaned ? cleaned : description);
  const direction = amount < 0 ? "in" : amount > 0 ? "out" : "zero";
  return JSON.stringify(["v2", direction, text]);
}

export function isCategorized(row: {
  merchantClean: string | null; section: string | null; category: string | null;
  spread: string | null; transactionType: string | null; txnCode: string | null;
  channel: string | null;
}) {
  return Boolean(row.merchantClean && row.section && row.category && row.spread &&
    row.transactionType && row.txnCode && row.channel);
}
