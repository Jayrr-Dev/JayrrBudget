export type EnrichTransactionsResult =
  | { ok: true; enriched: number; failed: number }
  | { ok: false; error: string };

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function enrichTransactionsByIds(
  _transactionIds: number[],
): Promise<EnrichTransactionsResult> {
  throw new Error(RETIRED);
}

export async function enrichTransactionsForUpload(
  _statementUploadId: number,
): Promise<EnrichTransactionsResult> {
  throw new Error(RETIRED);
}
