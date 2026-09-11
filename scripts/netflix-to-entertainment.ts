/**
 * Netflix → Entertainment (keep subcategory Streaming if present)
 * Usage: npx tsx scripts/netflix-to-entertainment.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type Client } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function ensureNamed(
  db: Client,
  table: string,
  name: string,
): Promise<number> {
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

  const where = `
    lower(coalesce(description,'')) LIKE '%netflix%'
    OR lower(coalesce(merchant_clean,'')) LIKE '%netflix%'
    OR lower(coalesce(company,'')) LIKE '%netflix%'
  `;

  const before = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY section, category, subcategory
    ORDER BY c DESC
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  const samples = await db.execute(`
    SELECT posted, merchant_clean, description, section, category, subcategory
    FROM transactions
    WHERE ${where}
    ORDER BY posted DESC
  `);
  console.log("rows:");
  for (const r of samples.rows) console.log(r);

  const entertainmentId = await ensureNamed(
    db,
    "transaction_sections",
    "Entertainment",
  );
  const categoryName = "Streaming";
  const catId = await ensureNamed(db, "transaction_categories", categoryName);

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Entertainment',
            section_id = ?,
            category = ?,
            category_id = ?,
            updated_at = ?
        WHERE ${where}
      `,
      args: [
        entertainmentId > 0 ? entertainmentId : null,
        categoryName,
        catId > 0 ? catId : null,
        Date.now(),
      ],
    });
  }

  const after = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY section, category, subcategory
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
