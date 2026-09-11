export type BackfillTransactionTypesResult = {
  scanned: number;
  updated: number;
  unchanged: number;
  legacyTypeRemoved: number;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function backfillTransactionTypes(): Promise<BackfillTransactionTypesResult> {
  throw new Error(RETIRED);
}
