import { applySpendDimensions } from "@/domains/enrichment/application/applySpendDimensions";
import { cleanCategoriesWithAi } from "@/domains/statements/application/cleanCategoriesWithAi";
import { consolidateCategoryLabels } from "@/domains/statements/application/consolidateCategories";
import { runStage } from "@/shared/ai/runStage";

export type CategoryHygieneResult = {
  consolidate: Awaited<ReturnType<typeof consolidateCategoryLabels>>;
  rules: Awaited<ReturnType<typeof applySpendDimensions>>;
  aiClean: Awaited<ReturnType<typeof cleanCategoriesWithAi>> & {
    error?: string;
  };
  warnings: string[];
};

const EMPTY_AI_CLEAN = { batches: 0, reviewed: 0, updated: 0, tagsApplied: 0 };

/**
 * Full category hygiene: merge near-dupe labels → deterministic rules → AI QA pass.
 * Later stages still run if an earlier AI call fails.
 */
export async function runCategoryHygienePipeline(options?: {
  transactionIds?: number[];
  skipAi?: boolean;
}): Promise<CategoryHygieneResult> {
  const warnings: string[] = [];

  const consolidateStage = await runStage("category-hygiene:consolidate", () =>
    consolidateCategoryLabels(),
  );
  const consolidate = consolidateStage.ok
    ? consolidateStage.value
    : { mergesApplied: 0, rowsUpdated: 0, merges: [] };
  if (!consolidateStage.ok) warnings.push(consolidateStage.error);
  else {
    console.info(
      `[category-hygiene] consolidate merges=${consolidate.mergesApplied} rows=${consolidate.rowsUpdated}`,
    );
  }

  const rulesStage = await runStage("category-hygiene:rules", () =>
    applySpendDimensions(),
  );
  const rules = rulesStage.ok
    ? rulesStage.value
    : { matched: 0, categoryUpdated: 0, tagsApplied: 0, enrichmentUpdated: 0 };
  if (!rulesStage.ok) warnings.push(rulesStage.error);
  else {
    console.info(
      `[category-hygiene] rules matched=${rules.matched} categories=${rules.categoryUpdated} tags=${rules.tagsApplied}`,
    );
  }

  if (options?.skipAi) {
    return { consolidate, rules, aiClean: EMPTY_AI_CLEAN, warnings };
  }

  const aiStage = await runStage("category-hygiene:ai", () =>
    cleanCategoriesWithAi({
      transactionIds: options?.transactionIds,
    }),
  );
  const aiClean = aiStage.ok
    ? aiStage.value
    : { ...EMPTY_AI_CLEAN, error: aiStage.error };
  if (!aiStage.ok) warnings.push(aiStage.error);
  else {
    console.info(
      `[category-hygiene] aiClean reviewed=${aiClean.reviewed} updated=${aiClean.updated} tags=${aiClean.tagsApplied}`,
    );
  }

  if (
    !consolidateStage.ok &&
    !rulesStage.ok &&
    !aiStage.ok
  ) {
    throw new Error(warnings[0] ?? "Category hygiene failed");
  }

  return { consolidate, rules, aiClean, warnings };
}
