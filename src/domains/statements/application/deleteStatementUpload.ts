import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/shared/db";
import {
  bankHistoryRows,
  statementUploads,
  transactions,
} from "@/shared/db/schema";
import { errorMessage } from "@/shared/lib/error-message";

export type DeleteStatementUploadResult =
  | {
      ok: true;
      filename: string;
      deletedTransactions: number;
    }
  | { ok: false; status: number; error: string };

/**
 * Delete a statement upload and every ledger row that came from it.
 * Enrichment and labels cascade off those transactions.
 */
export async function deleteStatementUpload(
  id: number,
): Promise<DeleteStatementUploadResult> {
  try {
    const db = getDb();
    const [upload] = await db
      .select({
        id: statementUploads.id,
        filename: statementUploads.filename,
      })
      .from(statementUploads)
      .where(eq(statementUploads.id, id))
      .limit(1);

    if (!upload) {
      return { ok: false, status: 404, error: "Statement upload not found." };
    }

    const childRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.statementUploadId, id));
    const childIds = childRows.map((row) => row.id);

    if (childIds.length) {
      await db
        .update(bankHistoryRows)
        .set({
          matchedTransactionId: null,
          matchStatus: "unmatched",
        })
        .where(inArray(bankHistoryRows.matchedTransactionId, childIds));

      await db
        .delete(transactions)
        .where(inArray(transactions.id, childIds));
    }

    await db.delete(statementUploads).where(eq(statementUploads.id, id));

    return {
      ok: true,
      filename: upload.filename,
      deletedTransactions: childIds.length,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: errorMessage(error, "Failed to delete statement upload"),
    };
  }
}
