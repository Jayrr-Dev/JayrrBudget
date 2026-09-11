export type DeleteStatementUploadResult =
  | {
      ok: true;
      filename: string;
      deletedTransactions: number;
    }
  | { ok: false; status: number; error: string };

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function deleteStatementUpload(
  _id: number,
): Promise<DeleteStatementUploadResult> {
  throw new Error(RETIRED);
}
