export type ReconcileBankHistoryResult = {
  historyRows: number;
  matched: number;
  historyUnmatched: number;
  statementExtra: number;
  signsFlipped: number;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function reconcileBankHistory(): Promise<ReconcileBankHistoryResult> {
  throw new Error(RETIRED);
}
