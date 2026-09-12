import {
  classifySpread,
  SPREAD_DEFINITIONS,
  type SpreadName,
} from "@/domains/transactions/domain/spreads";
import { getDb } from "@/shared/db";
import { transactions, transactionSpreads } from "@/shared/db/schema";
import { eq, sql } from "drizzle-orm";

export type BackfillSpreadsResult = {
  seeded: number;
  updated: number;
  bySpread: Record<SpreadName | "null", number>;
  total: number;
};

/**
 * Ensure Spread lookup rows exist and set transactions.spread / spread_id
 * from section/category/subcategory (Turso-safe: prefetch + batched updates).
 */
export async function backfillSpreads(): Promise<BackfillSpreadsResult> {
  const db = getDb();

  for (const def of SPREAD_DEFINITIONS) {
    await db
      .insert(transactionSpreads)
      .values({
        name: def.name,
        targetPercent: def.targetPercent,
        description: def.description,
        sortOrder: def.sortOrder,
      })
      .onConflictDoUpdate({
        target: transactionSpreads.name,
        set: {
          targetPercent: def.targetPercent,
          description: def.description,
          sortOrder: def.sortOrder,
        },
      });
  }

  const spreadRows = await db.select().from(transactionSpreads);
  const idByName = new Map(
    spreadRows.map((row) => [row.name as SpreadName, row.id]),
  );

  const txnRows = await db
    .select({
      id: transactions.id,
      section: transactions.section,
      category: transactions.category,
      subcategory: transactions.subcategory,
      spread: transactions.spread,
      spreadId: transactions.spreadId,
    })
    .from(transactions);

  const bySpread: Record<SpreadName | "null", number> = {
    Income: 0,
    Needs: 0,
    Wants: 0,
    Savings: 0,
    null: 0,
  };

  let updated = 0;
  const BATCH = 80;
  const pending: Array<{
    id: number;
    spread: string | null;
    spreadId: number | null;
  }> = [];

  for (const row of txnRows) {
    const next = classifySpread({
      section: row.section,
      category: row.category,
      subcategory: row.subcategory,
    });
    const nextId = next ? (idByName.get(next) ?? null) : null;
    if (next) bySpread[next] += 1;
    else bySpread.null += 1;

    if (row.spread === next && row.spreadId === nextId) continue;
    pending.push({ id: row.id, spread: next, spreadId: nextId });
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((item) =>
        db
          .update(transactions)
          .set({ spread: item.spread, spreadId: item.spreadId })
          .where(eq(transactions.id, item.id)),
      ),
    );
    updated += chunk.length;
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(transactions);

  return {
    seeded: SPREAD_DEFINITIONS.length,
    updated,
    bySpread,
    total: Number(total),
  };
}
