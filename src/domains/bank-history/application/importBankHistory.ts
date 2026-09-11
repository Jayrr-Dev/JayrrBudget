export type ImportBankHistoryResult = {
  filename: string;
  fileId: number;
  accountMask: string;
  accountType: string;
  inserted: number;
  skipped: boolean;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function importBankHistoryFile(_params: {
  filename: string;
  bytes: Buffer;
  hint?: import("@/domains/bank-history/domain/parseCibcCsv").AccountHint | null;
}): Promise<ImportBankHistoryResult> {
  throw new Error(RETIRED);
}
