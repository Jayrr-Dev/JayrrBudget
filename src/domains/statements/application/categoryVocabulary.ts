import { sql } from "drizzle-orm";
import { SEED_TAXONOMY } from "@/domains/enrichment/domain/seedTaxonomy";
import { toSlug } from "@/domains/enrichment/domain/slug";
import { getDb } from "@/shared/db";
import { transactions } from "@/shared/db/schema";

export type CategoryVocabulary = {
  categoryPrimary: string[];
  categoryDetailed: string[];
  paymentChannels: string[];
  transactionCodes: string[];
};

/** Display-ish normalize for matching near-duplicate labels. */
export function normalizeCategoryLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Collapse obvious plural/singular noise for matching. */
export function singularCategoryKey(value: string) {
  const normalized = normalizeCategoryLabel(value);
  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((word) => {
      if (word.length <= 3) return word;
      if (word.endsWith("ies") && word.length > 4) {
        return `${word.slice(0, -3)}y`;
      }
      if (word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches")) {
        return word.slice(0, -2);
      }
      if (word.endsWith("s") && !word.endsWith("ss")) {
        return word.slice(0, -1);
      }
      return word;
    })
    .join(" ");
}

export function categoryMatchKey(value: string) {
  return toSlug(singularCategoryKey(value));
}

function uniquePreferExisting(values: Array<string | null | undefined>) {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    if (!raw?.trim()) continue;
    const trimmed = raw.trim();
    const key = categoryMatchKey(trimmed);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/** Seed type/category names act as preferred detailed labels. */
function seedDetailedLabels() {
  return SEED_TAXONOMY.filter(
    (node) => node.facet === "type" || node.facet === "category",
  ).map((node) => node.name);
}

export async function loadCategoryVocabulary(): Promise<CategoryVocabulary> {
  const db = getDb();
  const rows = await db
    .select({
      categoryPrimary: transactions.categoryPrimary,
      categoryDetailed: transactions.categoryDetailed,
      paymentChannel: transactions.paymentChannel,
      transactionCode: transactions.transactionCode,
    })
    .from(transactions);

  return {
    categoryPrimary: uniquePreferExisting(
      rows.map((row) => row.categoryPrimary),
    ),
    categoryDetailed: uniquePreferExisting([
      ...seedDetailedLabels(),
      ...rows.map((row) => row.categoryDetailed),
    ]),
    paymentChannels: uniquePreferExisting(
      rows.map((row) => row.paymentChannel),
    ),
    transactionCodes: uniquePreferExisting(
      rows.map((row) => row.transactionCode),
    ),
  };
}

export function formatCategoryVocabularyForPrompt(
  vocabulary: CategoryVocabulary,
) {
  const detailed = vocabulary.categoryDetailed.slice(0, 250);
  const primary = vocabulary.categoryPrimary.slice(0, 80);

  return [
    "EXISTING CATEGORY LABELS — reuse EXACTLY when the spend matches (do not invent near-duplicates):",
    "categoryDetailed (preferred fine label):",
    detailed.length
      ? detailed.map((label) => `- ${label}`).join("\n")
      : "- (none yet — invent carefully, singular Title Case preferred)",
    "",
    "categoryPrimary (broad bucket, SCREAMING_SNAKE preferred):",
    primary.length
      ? primary.map((label) => `- ${label}`).join("\n")
      : "- FOOD_AND_DRINK, TRANSPORTATION, GENERAL_MERCHANDISE, TRANSFER, BANK_FEES, INCOME, …",
    "",
    "Rules:",
    '- Prefer an existing detailed label over a new synonym ("Gas Stations" not "Gas" / "gas station").',
    "- Do not emit both singular and plural variants of the same idea.",
    "- Do not emit typos or close paraphrases of an existing label.",
    "- Only invent a NEW detailed label when nothing existing is a reasonable match.",
  ].join("\n");
}

export function resolveAgainstVocabulary(
  value: string | null | undefined,
  vocabulary: string[],
): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const key = categoryMatchKey(trimmed);
  if (!key) return null;

  for (const candidate of vocabulary) {
    if (categoryMatchKey(candidate) === key) return candidate;
  }

  // Containment only for clear extensions: gas → gas-stations
  const contained = vocabulary.filter((candidate) => {
    const candidateKey = categoryMatchKey(candidate);
    return (
      candidateKey === key ||
      candidateKey.startsWith(`${key}-`) ||
      key.startsWith(`${candidateKey}-`)
    );
  });

  if (contained.length === 1) return contained[0];

  // Ambiguous extensions — leave for the AI consolidate pass
  return trimmed;
}

/** Count rows still using a label (for picking canonical forms). */
export async function countCategoryDetailedUsage() {
  const db = getDb();
  const rows = await db
    .select({
      label: transactions.categoryDetailed,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .groupBy(transactions.categoryDetailed);

  return rows
    .filter((row) => row.label)
    .map((row) => ({ label: row.label as string, count: row.count }));
}
