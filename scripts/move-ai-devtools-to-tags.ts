/**
 * Move AI / Dev Tools from transactions.kind into transactions.tags.
 * Leaves Subscription / Fee / Statement (and similar) on kind.
 *
 *   npx tsx scripts/move-ai-devtools-to-tags.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { joinTags, splitTags } from "../src/domains/transactions/domain/tags";

const MOVE_TO_TAGS = new Set(["ai", "dev tools"]);

function splitKind(raw: string | null | undefined): string[] {
  return splitTags(raw);
}

function partitionKind(parts: string[]): {
  keep: string[];
  toTags: string[];
} {
  const keep: string[] = [];
  const toTags: string[] = [];
  for (const part of parts) {
    if (MOVE_TO_TAGS.has(part.toLowerCase())) toTags.push(part);
    else keep.push(part);
  }
  return { keep, toTags };
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (!url) throw new Error("DATABASE_URL missing");
  if (url.startsWith("file:")) throw new Error("Refusing file: DATABASE_URL");
  console.log("target", url.replace(/(libsql:\/\/)[^/]+/, "$1***"));

  const c = createClient({ url, authToken });

  const rows = await c.execute(`
    SELECT id, kind, kind_id, tags
    FROM transactions
    WHERE kind LIKE '%AI%'
       OR kind LIKE '%Dev Tools%'
  `);
  console.log("candidates", rows.rows.length);

  // Ensure remaining kind lookup rows exist
  for (const name of ["Subscription", "Fee", "Statement"]) {
    await c.execute({
      sql: `INSERT INTO transaction_kinds (name)
            SELECT ?
            WHERE NOT EXISTS (SELECT 1 FROM transaction_kinds WHERE name = ?)`,
      args: [name, name],
    });
  }
  const kindIds = await c.execute(`SELECT id, name FROM transaction_kinds`);
  const idByName = new Map(
    kindIds.rows.map((r) => [String(r.name), Number(r.id)]),
  );

  let updated = 0;
  const BATCH = 40;
  const pending: Array<{
    id: number;
    kind: string | null;
    kindId: number | null;
    tags: string | null;
  }> = [];

  for (const row of rows.rows) {
    const id = Number(row.id);
    const parts = splitKind(String(row.kind ?? ""));
    const { keep, toTags } = partitionKind(parts);
    if (toTags.length === 0) continue;

    const nextKind = joinTags(keep)?.replace(/, /g, "; ") ?? null;
    const nextTags = joinTags([
      ...splitTags(String(row.tags ?? "")),
      ...toTags,
    ]);
    const kindId = nextKind ? (idByName.get(nextKind) ?? null) : null;

    // Upsert composite kind name if needed (e.g. still "Fee; Subscription")
    if (nextKind && kindId == null) {
      await c.execute({
        sql: `INSERT INTO transaction_kinds (name)
              SELECT ?
              WHERE NOT EXISTS (SELECT 1 FROM transaction_kinds WHERE name = ?)`,
        args: [nextKind, nextKind],
      });
      const got = await c.execute({
        sql: `SELECT id FROM transaction_kinds WHERE name = ? LIMIT 1`,
        args: [nextKind],
      });
      const newId = Number(got.rows[0]?.id);
      idByName.set(nextKind, newId);
      pending.push({
        id,
        kind: nextKind,
        kindId: newId,
        tags: nextTags,
      });
    } else {
      pending.push({
        id,
        kind: nextKind,
        kindId,
        tags: nextTags,
      });
    }
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((item) =>
        c.execute({
          sql: `UPDATE transactions SET kind = ?, kind_id = ?, tags = ? WHERE id = ?`,
          args: [item.kind, item.kindId, item.tags, item.id],
        }),
      ),
    );
    updated += chunk.length;
    console.log(`updated ${updated}/${pending.length}`);
  }

  // Drop unused kind lookup rows that were only AI/Dev Tools composites
  for (const name of [
    "AI; Subscription",
    "Dev Tools",
    "Dev Tools; Subscription",
  ]) {
    await c.execute({
      sql: `DELETE FROM transaction_kinds
            WHERE name = ?
              AND NOT EXISTS (SELECT 1 FROM transactions WHERE kind = ?)`,
      args: [name, name],
    });
  }

  const afterKind = await c.execute(`
    SELECT kind, count(*) AS n FROM transactions
    WHERE kind LIKE '%AI%' OR kind LIKE '%Dev Tools%' OR kind IS NOT NULL
    GROUP BY kind ORDER BY n DESC LIMIT 20
  `);
  console.log("kinds after", afterKind.rows);

  const afterTags = await c.execute(`
    SELECT tags, count(*) AS n FROM transactions
    WHERE tags LIKE '%AI%' OR tags LIKE '%Dev Tools%'
    GROUP BY tags ORDER BY n DESC LIMIT 20
  `);
  console.log("tags after", afterTags.rows);

  c.close();
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
