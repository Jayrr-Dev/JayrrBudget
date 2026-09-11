/**
 * MECE fix:
 * - Car Rental rows under Flights → category Rentals (keep subcategory Car Rental)
 * - Lodging → Rentals (keep lodging subcategories)
 *
 * Usage: npx tsx scripts/fix-rentals-category.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function ensureCategory(
  db: ReturnType<typeof createClient>,
  name: string,
  cache: Map<string, number>,
): Promise<number> {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const existing = await db.execute({
    sql: `SELECT id FROM transaction_categories WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (existing.rows[0]?.id != null) {
    const id = Number(existing.rows[0].id);
    cache.set(key, id);
    return id;
  }
  if (!APPLY) {
    console.log(`  would create category ${name}`);
    return -1;
  }
  const ins = await db.execute({
    sql: `INSERT INTO transaction_categories (name) VALUES (?)`,
    args: [name],
  });
  const id = Number(ins.lastInsertRowid);
  cache.set(key, id);
  return id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const before = await db.execute(`
    SELECT category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category IN ('Flights','Lodging','Rentals')
       OR subcategory IN ('Car Rental','Hotels & Vacation Rentals')
       OR lower(coalesce(subcategory,'')) LIKE '%rental%'
       OR lower(coalesce(category,'')) LIKE '%lodging%'
    GROUP BY category, subcategory
    ORDER BY category, c DESC
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  const cache = new Map<string, number>();
  const rentalsId = await ensureCategory(db, "Rentals", cache);

  // 1) Car Rental under Flights (or any non-Rentals) → Rentals
  const carRows = await db.execute(`
    SELECT COUNT(*) AS c FROM transactions
    WHERE lower(coalesce(subcategory,'')) = 'car rental'
       OR (
         lower(coalesce(category,'')) = 'flights'
         AND (
           lower(coalesce(merchant_clean,'')) LIKE '%avis%'
           OR lower(coalesce(description,'')) LIKE '%avis%'
           OR lower(coalesce(description,'')) LIKE '%rent-a-car%'
           OR lower(coalesce(description,'')) LIKE '%rental%'
         )
       )
  `);
  console.log(`car-rental-ish rows: ${carRows.rows[0]?.c}`);

  if (APPLY && rentalsId > 0) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET category = 'Rentals',
            category_id = ?,
            subcategory = CASE
              WHEN lower(coalesce(subcategory,'')) IN ('', 'flights', 'airline tickets')
                THEN 'Car Rental'
              ELSE subcategory
            END,
            updated_at = ?
        WHERE lower(coalesce(subcategory,'')) = 'car rental'
           OR (
             lower(coalesce(category,'')) = 'flights'
             AND (
               lower(coalesce(merchant_clean,'')) LIKE '%avis%'
               OR lower(coalesce(description,'')) LIKE '%avis%'
               OR lower(coalesce(description,'')) LIKE '%rent-a-car%'
               OR lower(coalesce(description,'')) LIKE '%etolavis%'
               OR lower(coalesce(description,'')) LIKE '%avisnycfee%'
               OR lower(coalesce(description,'')) LIKE '%avisfine%'
             )
           )
      `,
      args: [rentalsId, Date.now()],
    });
  } else {
    console.log("  would move Car Rental → Rentals");
  }

  // 2) Lodging → Rentals
  const lodging = await db.execute(`
    SELECT COUNT(*) AS c FROM transactions WHERE category = 'Lodging'
  `);
  console.log(`Lodging rows: ${lodging.rows[0]?.c}`);

  if (APPLY && rentalsId > 0) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET category = 'Rentals',
            category_id = ?,
            updated_at = ?
        WHERE category = 'Lodging'
      `,
      args: [rentalsId, Date.now()],
    });
    // Retire empty Lodging lookup name if unused
    const left = await db.execute(
      `SELECT COUNT(*) AS c FROM transactions WHERE category = 'Lodging'`,
    );
    if (Number(left.rows[0]?.c ?? 0) === 0) {
      await db.execute({
        sql: `UPDATE transaction_categories SET name = ? WHERE name = 'Lodging'`,
        args: ["_Retired Lodging"],
      });
    }
  } else {
    console.log("  would rename Lodging → Rentals");
  }

  // Link Rentals category to Travel section if possible
  if (APPLY && rentalsId > 0) {
    const travel = await db.execute(
      `SELECT id FROM transaction_sections WHERE name = 'Travel' LIMIT 1`,
    );
    if (travel.rows[0]?.id != null) {
      await db.execute({
        sql: `UPDATE transaction_categories SET section_id = ? WHERE id = ?`,
        args: [Number(travel.rows[0].id), rentalsId],
      });
    }
  }

  const after = await db.execute(`
    SELECT category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category IN ('Flights','Lodging','Rentals','_Retired Lodging')
       OR subcategory IN ('Car Rental','Hotels & Vacation Rentals')
    GROUP BY category, subcategory
    ORDER BY category, c DESC
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
