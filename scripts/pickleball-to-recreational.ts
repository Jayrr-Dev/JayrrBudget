/**
 * Edmonton Pickleball → Entertainment / Recreational / Pickleball
 * Usage: npx tsx scripts/pickleball-to-recreational.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function ensure(table: string, name: string, db: ReturnType<typeof createClient>) {
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
    lower(coalesce(merchant_clean,'')) LIKE '%pickleball%'
    OR lower(coalesce(description,'')) LIKE '%pickleball%'
  `;

  const before = await db.execute(`
    SELECT section, category, subcategory, merchant_clean, COUNT(*) AS c
    FROM transactions WHERE ${where}
    GROUP BY section, category, subcategory, merchant_clean
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  const sectionId = await ensure("transaction_sections", "Entertainment", db);
  const catId = await ensure("transaction_categories", "Recreational", db);
  const subId = await ensure("transaction_subcategories", "Pickleball", db);

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Entertainment',
            section_id = ?,
            category = 'Recreational',
            category_id = ?,
            subcategory = 'Pickleball',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${where}
      `,
      args: [
        sectionId > 0 ? sectionId : null,
        catId > 0 ? catId : null,
        subId > 0 ? subId : null,
        Date.now(),
      ],
    });
  }

  const after = await db.execute(`
    SELECT section, category, subcategory, merchant_clean, COUNT(*) AS c
    FROM transactions WHERE ${where}
    GROUP BY section, category, subcategory, merchant_clean
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
