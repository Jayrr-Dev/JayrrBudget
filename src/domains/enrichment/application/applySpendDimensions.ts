export type ApplySpendDimensionsResult = {
  matched: number;
  categoryUpdated: number;
  tagsApplied: number;
  enrichmentUpdated: number;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function applySpendDimensions(): Promise<ApplySpendDimensionsResult> {
  throw new Error(RETIRED);
}
