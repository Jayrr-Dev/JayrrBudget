import {
  hasTag,
  joinTags,
  splitTags,
} from "@/domains/transactions/domain/tags";
import { getDb } from "@/shared/db";
import { invalidateTursoReadCache } from "@/shared/db/readCache";
import { transactions } from "@/shared/db/schema";
import { eq } from "drizzle-orm";

export type AddTransactionTagInput = {
  transactionId: string;
  tag: string;
};

export type AddTransactionTagResult = {
  transactionId: string;
  tag: string;
  tags: string[];
  added: boolean;
};

/** Append one tag to a single transaction (no-op if already present). */
export async function addTransactionTag(
  input: AddTransactionTagInput,
): Promise<AddTransactionTagResult> {
  const transactionId = input.transactionId.trim();
  const tag = input.tag.trim();
  if (!transactionId) throw new Error("transactionId is required");
  if (!tag) throw new Error("Tag name is required");

  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      tags: transactions.tags,
    })
    .from(transactions)
    .where(eq(transactions.transactionId, transactionId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Transaction not found");

  const tags = splitTags(row.tags);
  if (hasTag(tags, tag)) {
    return { transactionId, tag, tags, added: false };
  }

  tags.push(tag);
  await db
    .update(transactions)
    .set({ tags: joinTags(tags), updatedAt: new Date() })
    .where(eq(transactions.id, row.id));

  invalidateTursoReadCache();
  return { transactionId, tag, tags, added: true };
}
