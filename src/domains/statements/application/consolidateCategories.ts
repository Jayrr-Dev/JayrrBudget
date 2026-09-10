import { z } from "zod";
import {
  categoryMatchKey,
  countCategoryDetailedUsage,
  loadCategoryVocabulary,
  normalizeCategoryLabel,
} from "@/domains/statements/application/categoryVocabulary";
import { generateObjectWithFallback } from "@/shared/ai/openRouter";
import { getDb } from "@/shared/db";
import { transactions } from "@/shared/db/schema";
import { eq, sql } from "drizzle-orm";

const consolidateSchema = z.object({
  merges: z
    .array(
      z.object({
        from: z
          .string()
          .describe("Exact label from the input list that should be retired"),
        to: z
          .string()
          .describe(
            "Canonical label to keep (prefer an existing list entry; Title Case)",
          ),
      }),
    )
    .describe(
      "Near-duplicate merges only. Empty if labels are already clean. Never merge unrelated spend types.",
    ),
});

export type CategoryConsolidateResult = {
  mergesApplied: number;
  rowsUpdated: number;
  merges: Array<{ from: string; to: string }>;
};

async function generateConsolidateMerges(labels: string[]) {
  const prompt = [
    "You clean a personal-finance categoryDetailed vocabulary.",
    "Merge near-duplicates / synonyms / plural-singular / typos into ONE canonical label.",
    "Examples that MUST merge:",
    '- "gas" + "gas station" + "gas stations" → "Gas Stations"',
    '- "restaurant" + "restaurants" + "resturants" → "Restaurants"',
    '- "convenience store" + "convenience stores" → "Convenience Store"',
    '- "online retail" + "online marketplaces" → keep the clearer existing label',
    '- "payment" vs "credit card payment" → merge if both mean card payments',
    "Do NOT merge unrelated ideas (pharmacies ≠ insurance).",
    'Do NOT merge "SaaS" or "Developer Tools" into "Online Retail" / shopping labels.',
    "Prefer the more specific common label already in the list when choosing `to`.",
    "Use Title Case for `to`. `from` must match an input label exactly.",
    "Return only real merges. Skip labels that are already unique.",
    "",
    "LABELS:",
    ...labels.map((label) => `- ${label}`),
  ].join("\n");

  const { object } = await generateObjectWithFallback({
    schema: consolidateSchema,
    logLabel: "category-consolidate",
    prompt,
  });
  return object.merges;
}

/** Deterministic merges for plural/case/slug twins before calling the model. */
export function buildDeterministicMerges(
  labels: Array<{ label: string; count: number }>,
) {
  const byKey = new Map<string, Array<{ label: string; count: number }>>();

  for (const entry of labels) {
    const key = categoryMatchKey(entry.label);
    if (!key) continue;
    const group = byKey.get(key) ?? [];
    group.push(entry);
    byKey.set(key, group);
  }

  const merges: Array<{ from: string; to: string }> = [];

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.length - b.label.length;
    });
    const canonical = ranked[0].label;
    for (const entry of ranked.slice(1)) {
      if (entry.label !== canonical) {
        merges.push({ from: entry.label, to: canonical });
      }
    }
  }

  return merges;
}

function resolveMergeChain(
  from: string,
  map: Map<string, string>,
  seen = new Set<string>(),
): string {
  if (seen.has(from)) return from;
  seen.add(from);
  const next = map.get(from);
  if (!next || next === from) return from;
  return resolveMergeChain(next, map, seen);
}

async function applyDetailedMerges(
  merges: Array<{ from: string; to: string }>,
) {
  if (merges.length === 0) {
    return { mergesApplied: 0, rowsUpdated: 0, merges: [] as Array<{ from: string; to: string }> };
  }

  const map = new Map<string, string>();
  for (const merge of merges) {
    const from = merge.from.trim();
    const to = merge.to.trim();
    if (!from || !to || from === to) continue;
    map.set(from, to);
  }

  const resolved: Array<{ from: string; to: string }> = [];
  for (const from of map.keys()) {
    const to = resolveMergeChain(from, map);
    if (from !== to) resolved.push({ from, to });
  }

  const db = getDb();
  let rowsUpdated = 0;

  for (const merge of resolved) {
    const matched = await db
      .select({ id: transactions.id, label: transactions.categoryDetailed })
      .from(transactions)
      .where(
        sql`lower(trim(coalesce(${transactions.categoryDetailed}, ''))) = ${normalizeCategoryLabel(merge.from)}`,
      );

    for (const row of matched) {
      if (!row.label || row.label === merge.to) continue;
      await db
        .update(transactions)
        .set({ categoryDetailed: merge.to, updatedAt: new Date() })
        .where(eq(transactions.id, row.id));
      rowsUpdated += 1;
    }
  }

  return {
    mergesApplied: resolved.length,
    rowsUpdated,
    merges: resolved,
  };
}

/**
 * Cleaning pass: merge near-duplicate categoryDetailed labels across the ledger.
 * Deterministic plural/case first, then AI for semantic twins (gas vs gas stations).
 */
export async function consolidateCategoryLabels(): Promise<CategoryConsolidateResult> {
  const usage = await countCategoryDetailedUsage();
  if (usage.length < 2) {
    return { mergesApplied: 0, rowsUpdated: 0, merges: [] };
  }

  const deterministic = buildDeterministicMerges(usage);
  let workingUsage = usage;
  let total = await applyDetailedMerges(deterministic);

  if (deterministic.length > 0) {
    workingUsage = await countCategoryDetailedUsage();
  }

  const vocabulary = await loadCategoryVocabulary();
  const labels = workingUsage.map((entry) => entry.label);

  // Skip AI when few labels left
  if (labels.length < 2) {
    return total;
  }

  try {
    const aiMerges = await generateConsolidateMerges(labels);
    const allowed = new Set(labels);
    const preferred = new Set(vocabulary.categoryDetailed);
    const cleaned = aiMerges
      .map((merge) => ({
        from: merge.from.trim(),
        to: merge.to.trim(),
      }))
      .filter((merge) => {
        if (!merge.from || !merge.to || merge.from === merge.to) return false;
        if (!allowed.has(merge.from)) return false;
        // Prefer mapping onto an existing preferred label when keys match
        if (!preferred.has(merge.to)) {
          const match = vocabulary.categoryDetailed.find(
            (label) => categoryMatchKey(label) === categoryMatchKey(merge.to),
          );
          if (match) merge.to = match;
        }
        return true;
      });

    const aiResult = await applyDetailedMerges(cleaned);
    return {
      mergesApplied: total.mergesApplied + aiResult.mergesApplied,
      rowsUpdated: total.rowsUpdated + aiResult.rowsUpdated,
      merges: [...total.merges, ...aiResult.merges],
    };
  } catch (error) {
    console.warn(
      "[statements] category consolidate AI skipped:",
      error instanceof Error ? error.message : error,
    );
    return total;
  }
}
