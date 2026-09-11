/**
 * 1) Transport / Fuel / Gas Stations → Transport / Auto Care & Expenses / Fuel
 * 2) 7-Eleven (7-11) with amount > 60 → same path
 *
 * Usage: npx tsx scripts/fix-fuel-and-711.ts [--run]
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

  const fuelWhere = `
    section = 'Transport'
    AND (
      category = 'Fuel'
      OR lower(coalesce(subcategory,'')) LIKE '%gas station%'
      OR lower(coalesce(subcategory,'')) = 'fuel'
      OR lower(coalesce(category,'')) LIKE '%fuel%'
    )
  `;

  // Absolute amount > 60 (charges stored as negative or positive)
  const sevenWhere = `
    (
      lower(coalesce(merchant_clean,'')) LIKE '%7-11%'
      OR lower(coalesce(merchant_clean,'')) LIKE '%7-eleven%'
      OR lower(coalesce(merchant_clean,'')) LIKE '%7 eleven%'
      OR lower(coalesce(merchant_clean,'')) LIKE '%seven eleven%'
      OR lower(coalesce(description,'')) LIKE '%7-11%'
      OR lower(coalesce(description,'')) LIKE '%7-eleven%'
      OR lower(coalesce(description,'')) LIKE '%7 eleven%'
      OR lower(coalesce(merchant_name,'')) LIKE '%7-11%'
      OR lower(coalesce(merchant_name,'')) LIKE '%7-eleven%'
    )
    AND abs(amount) > 60
  `;

  const fuelBefore = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${fuelWhere}
    GROUP BY 1, 2, 3
    ORDER BY c DESC
  `);
  console.log("fuel-ish before:", fuelBefore.rows);

  const sevenBefore = await db.execute(`
    SELECT id, posted, merchant_clean, description, amount, section, category, subcategory
    FROM transactions
    WHERE ${sevenWhere}
    ORDER BY abs(amount) DESC
  `);
  console.log(`7-11 over $60: ${sevenBefore.rows.length}`);
  for (const row of sevenBefore.rows) console.log(row);

  const sectionId = await ensure(db, "transaction_sections", "Transport");
  const categoryId = await ensure(
    db,
    "transaction_categories",
    "Auto Care & Expenses",
  );
  const subcategoryId = await ensure(
    db,
    "transaction_subcategories",
    "Fuel",
  );

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            category = 'Auto Care & Expenses',
            category_id = ?,
            subcategory = 'Fuel',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${fuelWhere}
      `,
      args: [
        sectionId > 0 ? sectionId : null,
        categoryId > 0 ? categoryId : null,
        subcategoryId > 0 ? subcategoryId : null,
        Date.now(),
      ],
    });

    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            category = 'Auto Care & Expenses',
            category_id = ?,
            subcategory = 'Fuel',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${sevenWhere}
      `,
      args: [
        sectionId > 0 ? sectionId : null,
        categoryId > 0 ? categoryId : null,
        subcategoryId > 0 ? subcategoryId : null,
        Date.now(),
      ],
    });
  }

  const fuelAfter = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE section = 'Transport'
      AND category = 'Auto Care & Expenses'
      AND subcategory = 'Fuel'
    GROUP BY 1, 2, 3
  `);
  const oldFuelLeft = await db.execute(`
    SELECT COUNT(*) AS c FROM transactions
    WHERE section = 'Transport' AND category = 'Fuel'
  `);
  const sevenAfter = await db.execute(`
    SELECT merchant_clean, section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${sevenWhere}
    GROUP BY 1, 2, 3, 4
  `);
  console.log("Fuel path after:", fuelAfter.rows);
  console.log("old Transport/Fuel left:", oldFuelLeft.rows[0]?.c);
  console.log("7-11 >60 after:", sevenAfter.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
