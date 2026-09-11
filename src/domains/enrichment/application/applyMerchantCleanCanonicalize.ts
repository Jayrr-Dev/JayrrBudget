export type MerchantCleanMergeSample = {
  from: string;
  to: string;
  rows: number;
};

export type ApplyMerchantCleanCanonicalizeResult = {
  scanned: number;
  distinctBefore: number;
  rowsUpdated: number;
  mergePairs: number;
  samples: MerchantCleanMergeSample[];
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function applyMerchantCleanCanonicalize(): Promise<ApplyMerchantCleanCanonicalizeResult> {
  throw new Error(RETIRED);
}
