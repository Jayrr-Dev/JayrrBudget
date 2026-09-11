/**
 * Shoppers Drug Mart + * Pharmacy → Health / Medical / Prescriptions
 * Usage: npx tsx scripts/fix-pharmacy-prescriptions.ts [--run]
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

  const where = `
    lower(coalesce(merchant_clean,'')) LIKE '%shoppers drug%'
    OR lower(coalesce(merchant_clean,'')) LIKE '%shoppersdrug%'
    OR lower(coalesce(merchant_name,'')) LIKE '%shoppers drug%'
    OR lower(coalesce(description,'')) LIKE '%shoppers drug%'
    OR lower(coalesce(merchant_clean,'')) LIKE '% pharmacy%'
    OR lower(coalesce(merchant_clean,'')) LIKE '%pharmacy%'
    OR lower(coalesce(merchant_name,'')) LIKE '% pharmacy%'
    OR lower(coalesce(description,'')) LIKE '% pharmacy%'
  `;

  const before = await db.execute(`
    SELECT merchant_clean, section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY 1, 2, 3, 4
    ORDER BY c DESC
  `);
  console.log("before:", before.rows);

  const sectionId = await ensure(db, "transaction_sections", "Health");
  const categoryId = await ensure(db, "transaction_categories", "Medical");
  const subcategoryId = await ensure(
    db,
    "transaction_subcategories",
    "Prescriptions",
  );

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Health',
            section_id = ?,
            category = 'Medical',
            category_id = ?,
            subcategory = 'Prescriptions',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${where}
      `,
      args: [
        sectionId > 0 ? sectionId : null,
        categoryId > 0 ? categoryId : null,
        subcategoryId > 0 ? subcategoryId : null,
        Date.now(),
      ],
    });
  }

  const after = await db.execute(`
    SELECT merchant_clean, section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY 1, 2, 3, 4
    ORDER BY c DESC
  `);
  console.log("after:", after.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
