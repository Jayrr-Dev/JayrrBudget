/**
 * Restaurants & Cafes → Food
 * Usage: npx tsx scripts/restaurants-to-food.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const before = await db.execute(`
    SELECT category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE lower(coalesce(category,'')) LIKE '%restaurant%'
       OR lower(coalesce(category,'')) LIKE '%cafe%'
       OR category = 'Food'
    GROUP BY category, subcategory
    ORDER BY category, c DESC
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  let foodId: number | null = null;
  const food = await db.execute(
    `SELECT id FROM transaction_categories WHERE name = 'Food' LIMIT 1`,
  );
  if (food.rows[0]?.id != null) foodId = Number(food.rows[0].id);
  else if (APPLY) {
    const ins = await db.execute(
      `INSERT INTO transaction_categories (name) VALUES ('Food')`,
    );
    foodId = Number(ins.lastInsertRowid);
  }

  const count = await db.execute(`
    SELECT COUNT(*) AS c FROM transactions
    WHERE lower(coalesce(category,'')) LIKE '%restaurant%'
       OR lower(coalesce(category,'')) LIKE '%cafe%'
  `);
  console.log(`rows to rename: ${count.rows[0]?.c}`);

  if (APPLY && foodId != null) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET category = 'Food',
            category_id = ?,
            updated_at = ?
        WHERE lower(coalesce(category,'')) LIKE '%restaurant%'
           OR lower(coalesce(category,'')) LIKE '%cafe%'
      `,
      args: [foodId, Date.now()],
    });

    // Retire old category lookup name
    await db.execute({
      sql: `UPDATE transaction_categories SET name = ? WHERE name IN ('Restaurants & Cafes', 'Restaurants and Cafes', 'Restaurant', 'Restaurants', 'Cafes', 'Cafe')`,
      args: ["_Retired Restaurants & Cafes"],
    });
  }

  const after = await db.execute(`
    SELECT category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category = 'Food'
       OR lower(coalesce(category,'')) LIKE '%restaurant%'
       OR lower(coalesce(category,'')) LIKE '%cafe%'
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
