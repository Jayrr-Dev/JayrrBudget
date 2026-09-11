export type CategoryCleanResult = {
  batches: number;
  reviewed: number;
  updated: number;
  tagsApplied: number;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function cleanCategoriesWithAi(_options?: {
  transactionIds?: number[];
}): Promise<CategoryCleanResult> {
  throw new Error(RETIRED);
}
