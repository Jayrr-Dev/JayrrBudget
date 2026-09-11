/**
 * Category Streaming → Entertainment (keep subcategory).
 * Usage: npx tsx scripts/fix-streaming-category.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type Client } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function ensure(db: Client, table: string, name: string) {
  const hit = await db.execute({
    sql: `SELECT id FROM ${table} WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (hit.rows[0]?.id != null) return Number(hit.rows[0].id);
  if (!APPLY) return -1;
  const ins = await db.execute({
    sql: `INSERT INTO ${table} (name) VALUES (?)`,
    args: [name],
  });
  return Number(ins.lastInsertRowid);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const before = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category = 'Streaming'
    GROUP BY 1, 2, 3
  `);
  console.log("before:", before.rows);

  const categoryId = await ensure(
    db,
    "transaction_categories",
    "Entertainment",
  );

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET category = 'Entertainment',
            category_id = ?,
            updated_at = ?
        WHERE category = 'Streaming'
      `,
      args: [categoryId > 0 ? categoryId : null, Date.now()],
    });
  }

  const after = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category = 'Entertainment' AND subcategory = 'Streaming'
    GROUP BY 1, 2, 3
  `);
  const left = await db.execute(
    `SELECT COUNT(*) AS c FROM transactions WHERE category = 'Streaming'`,
  );
  console.log("after:", after.rows);
  console.log("Streaming category left:", left.rows[0]?.c);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
