/**
 * Uber Eats → Lifestyle / Travel / Food Delivery
 * Usage: npx tsx scripts/uber-eats-to-lifestyle-travel.ts [--run]
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

  const eatsWhere = `
    (
      lower(coalesce(description,'')) LIKE '%uber%eats%'
      OR lower(coalesce(description,'')) LIKE '%uber *eats%'
      OR lower(coalesce(description,'')) LIKE '%ubereats%'
      OR lower(coalesce(merchant_clean,'')) LIKE '%uber eats%'
      OR lower(coalesce(merchant_raw,'')) LIKE '%eats%'
         AND lower(coalesce(merchant_clean,'')) LIKE '%uber%'
    )
  `;

  // merchant_raw may not exist on flat schema — check columns
  const cols = await db.execute(`PRAGMA table_info(transactions)`);
  const colNames = new Set(cols.rows.map((r) => String(r.name)));
  const where = colNames.has("merchant_raw")
    ? eatsWhere
    : `
    (
      lower(coalesce(description,'')) LIKE '%eats%'
      AND (
        lower(coalesce(description,'')) LIKE '%uber%'
        OR lower(coalesce(merchant_clean,'')) LIKE '%uber%'
      )
    )
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
    LIMIT 20
  `);
  console.log("samples:");
  for (const r of samples.rows) console.log(r);

  const lifestyleId = await ensureNamed(db, "transaction_sections", "Lifestyle");
  const travelId = await ensureNamed(db, "transaction_categories", "Travel");
  const deliveryId = await ensureNamed(
    db,
    "transaction_subcategories",
    "Food Delivery",
  );

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Lifestyle',
            section_id = ?,
            category = 'Travel',
            category_id = ?,
            subcategory = 'Food Delivery',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${where}
      `,
      args: [
        lifestyleId > 0 ? lifestyleId : null,
        travelId > 0 ? travelId : null,
        deliveryId > 0 ? deliveryId : null,
        Date.now(),
      ],
    });
  }

  const after = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY section, category, subcategory
    ORDER BY c DESC
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
