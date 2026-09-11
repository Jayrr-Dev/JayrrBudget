export type RewriteCategoryLabelsResult = {
  detailedUpdated: number;
  taxonomyLabelsUpdated: number;
  nodesRenamed: number;
  merges: Array<{ from: string; to: string }>;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function rewriteStoredCategoryLabels(): Promise<RewriteCategoryLabelsResult> {
  throw new Error(RETIRED);
}
