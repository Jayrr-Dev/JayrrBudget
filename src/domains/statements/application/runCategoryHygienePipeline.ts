import { applyCompanyEntities } from "@/domains/enrichment/application/applyCompanyEntities";
import { applyMerchantCleanCanonicalize } from "@/domains/enrichment/application/applyMerchantCleanCanonicalize";
import { applySpendDimensions } from "@/domains/enrichment/application/applySpendDimensions";
import { backfillTransactionTypes } from "@/domains/enrichment/application/backfillTransactionTypes";
import { cleanCategoriesWithAi } from "@/domains/statements/application/cleanCategoriesWithAi";
import { rewriteStoredCategoryLabels } from "@/domains/statements/application/rewriteStoredCategoryLabels";
import { consolidateCategoryLabels } from "@/domains/statements/application/consolidateCategories";
import { runStage } from "@/shared/ai/runStage";

export type CategoryHygieneResult = {
  rewrite: Awaited<ReturnType<typeof rewriteStoredCategoryLabels>>;
  consolidate: Awaited<ReturnType<typeof consolidateCategoryLabels>>;
  transactionTypes: Awaited<ReturnType<typeof backfillTransactionTypes>>;
  rules: Awaited<ReturnType<typeof applySpendDimensions>>;
  merchantClean: Awaited<ReturnType<typeof applyMerchantCleanCanonicalize>>;
  companies: Awaited<ReturnType<typeof applyCompanyEntities>>;
  aiClean: Awaited<ReturnType<typeof cleanCategoriesWithAi>> & {
    error?: string;
  };
  warnings: string[];
};

const EMPTY_MERCHANT_CLEAN = {
  scanned: 0,
  distinctBefore: 0,
  rowsUpdated: 0,
  mergePairs: 0,
  samples: [] as Awaited<
    ReturnType<typeof applyMerchantCleanCanonicalize>
  >["samples"],
};

const EMPTY_COMPANIES = {
  scanned: 0,
  matched: 0,
  companiesCreated: 0,
  linksCreated: 0,
  linksUpdated: 0,
  skippedUnchanged: 0,
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

  const rewriteStage = await runStage("category-hygiene:rewrite", () =>
    rewriteStoredCategoryLabels(),
  );
  const rewrite = rewriteStage.ok
    ? rewriteStage.value
    : {
        detailedUpdated: 0,
        taxonomyLabelsUpdated: 0,
        nodesRenamed: 0,
        merges: [],
      };
  if (!rewriteStage.ok) warnings.push(rewriteStage.error);
  else {
    console.info(
      `[category-hygiene] rewrite detailed=${rewrite.detailedUpdated} taxonomy=${rewrite.taxonomyLabelsUpdated} nodes=${rewrite.nodesRenamed} merges=${rewrite.merges.length}`,
    );
  }

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

  const transactionTypesStage = await runStage(
    "category-hygiene:transaction-types",
    () => backfillTransactionTypes(),
  );
  const transactionTypes = transactionTypesStage.ok
    ? transactionTypesStage.value
    : { scanned: 0, updated: 0, unchanged: 0, legacyTypeRemoved: 0 };
  if (!transactionTypesStage.ok) warnings.push(transactionTypesStage.error);
  else {
    console.info(
      `[category-hygiene] transactionTypes scanned=${transactionTypes.scanned} updated=${transactionTypes.updated} legacyRemoved=${transactionTypes.legacyTypeRemoved}`,
    );
  }

  const merchantCleanStage = await runStage(
    "category-hygiene:merchant-clean",
    () => applyMerchantCleanCanonicalize(),
  );
  const merchantClean = merchantCleanStage.ok
    ? merchantCleanStage.value
    : EMPTY_MERCHANT_CLEAN;
  if (!merchantCleanStage.ok) warnings.push(merchantCleanStage.error);
  else {
    console.info(
      `[category-hygiene] merchantClean rows=${merchantClean.rowsUpdated} pairs=${merchantClean.mergePairs}`,
    );
  }

  const companiesStage = await runStage("category-hygiene:companies", () =>
    applyCompanyEntities(),
  );
  const companies = companiesStage.ok
    ? companiesStage.value
    : EMPTY_COMPANIES;
  if (!companiesStage.ok) warnings.push(companiesStage.error);
  else {
    console.info(
      `[category-hygiene] companies matched=${companies.matched} created=${companies.companiesCreated} links+${companies.linksCreated} upd=${companies.linksUpdated}`,
    );
  }

  if (options?.skipAi) {
    return {
      rewrite,
      consolidate,
      transactionTypes,
      rules,
      merchantClean,
      companies,
      aiClean: EMPTY_AI_CLEAN,
      warnings,
    };
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
    !companiesStage.ok &&
    !aiStage.ok
  ) {
    throw new Error(warnings[0] ?? "Category hygiene failed");
  }

  return {
    rewrite,
    consolidate,
    transactionTypes,
    rules,
    merchantClean,
    companies,
    aiClean,
    warnings,
  };
}
