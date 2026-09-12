import {
  hasTag,
  joinTags,
  splitTags,
} from "@/domains/transactions/domain/tags";
import { getDb } from "@/shared/db";
import { invalidateTursoReadCache } from "@/shared/db/readCache";
import { transactions } from "@/shared/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";

export type TagByDateRangeInput = {
  tag: string;
  startDate: string;
  endDate: string;
};

export type TagByDateRangeResult = {
  matched: number;
  updated: number;
  tag: string;
  startDate: string;
  endDate: string;
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Add `tag` to every transaction with posted date in [startDate, endDate]. */
export async function tagByDateRange(
  input: TagByDateRangeInput,
): Promise<TagByDateRangeResult> {
  const tag = input.tag.trim();
  const startDate = input.startDate.trim();
  const endDate = input.endDate.trim();

  if (!tag) throw new Error("Tag name is required");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  const db = getDb();
  const matchedRows = await db
    .select({
      id: transactions.id,
      tags: transactions.tags,
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.posted, startDate),
        lte(transactions.posted, endDate),
      ),
    );

  let updated = 0;
  const now = new Date();
  for (const row of matchedRows) {
    const tags = splitTags(row.tags);
    if (hasTag(tags, tag)) continue;
    tags.push(tag);
    await db
      .update(transactions)
      .set({ tags: joinTags(tags), updatedAt: now })
      .where(eq(transactions.id, row.id));
    updated += 1;
  }

  if (updated > 0) invalidateTursoReadCache();

  return {
    matched: matchedRows.length,
    updated,
    tag,
    startDate,
    endDate,
  };
}
