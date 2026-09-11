/**
 * Travel + Food Delivery → Food / Food Delivery
 * Usage: npx tsx scripts/travel-food-delivery-to-food.ts [--run]
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

  const where = `
    category = 'Travel'
    AND subcategory = 'Food Delivery'
  `;

  const before = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY section, category, subcategory
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

  let deliveryId: number | null = null;
  const delivery = await db.execute(
    `SELECT id FROM transaction_subcategories WHERE name = 'Food Delivery' LIMIT 1`,
  );
  if (delivery.rows[0]?.id != null) deliveryId = Number(delivery.rows[0].id);

  // Prefer Lifestyle section for food
  let lifestyleId: number | null = null;
  const lifestyle = await db.execute(
    `SELECT id FROM transaction_sections WHERE name = 'Lifestyle' LIMIT 1`,
  );
  if (lifestyle.rows[0]?.id != null) lifestyleId = Number(lifestyle.rows[0].id);

  if (APPLY && foodId != null) {
    const rows = await db.execute(`
      SELECT id, tags FROM transactions WHERE ${where}
    `);
    for (const row of rows.rows) {
      let tags = row.tags == null ? null : String(row.tags);
      if (tags) {
        tags = tags
          .split(/[,|;]/)
          .map((t) => t.trim())
          .filter((t) => t && t.toLowerCase() !== "travel")
          .join(", ");
        if (!tags) tags = null;
      }
      await db.execute({
        sql: `
          UPDATE transactions
          SET section = 'Lifestyle',
              section_id = ?,
              category = 'Food',
              category_id = ?,
              subcategory = 'Food Delivery',
              subcategory_id = ?,
              tags = ?,
              updated_at = ?
          WHERE id = ?
        `,
        args: [lifestyleId, foodId, deliveryId, tags, Date.now(), row.id],
      });
    }
    console.log(`updated ${rows.rows.length} rows`);
  }

  const after = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category = 'Food' AND subcategory = 'Food Delivery'
    GROUP BY section, category, subcategory
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
