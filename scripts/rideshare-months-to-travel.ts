/**
 * Feb 2026 + June 2026 Rideshare → Transport / Travel / Rideshare
 * Usage: npx tsx scripts/rideshare-months-to-travel.ts [--run]
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
    category = 'Rideshare'
    AND (
      (posted >= '2026-02-01' AND posted < '2026-03-01')
      OR (posted >= '2026-06-01' AND posted < '2026-07-01')
    )
  `;

  const before = await db.execute(`
    SELECT substr(posted, 1, 7) AS month, section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE ${where}
    GROUP BY month, section, category, subcategory
    ORDER BY month
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  const samples = await db.execute(`
    SELECT posted, merchant_clean, description, amount
    FROM transactions
    WHERE ${where}
    ORDER BY posted
    LIMIT 15
  `);
  console.log("samples:");
  for (const r of samples.rows) console.log(r);

  const transport = await db.execute(
    `SELECT id FROM transaction_sections WHERE name = 'Transport' LIMIT 1`,
  );
  const travelCat = await db.execute(
    `SELECT id FROM transaction_categories WHERE name = 'Travel' LIMIT 1`,
  );
  let travelCatId = travelCat.rows[0]?.id
    ? Number(travelCat.rows[0].id)
    : null;
  if (!travelCatId && APPLY) {
    const ins = await db.execute(
      `INSERT INTO transaction_categories (name) VALUES ('Travel')`,
    );
    travelCatId = Number(ins.lastInsertRowid);
  }

  let rideshareSubId: number | null = null;
  const sub = await db.execute(
    `SELECT id FROM transaction_subcategories WHERE name = 'Rideshare' LIMIT 1`,
  );
  if (sub.rows[0]?.id != null) rideshareSubId = Number(sub.rows[0].id);
  else if (APPLY) {
    const ins = await db.execute(
      `INSERT INTO transaction_subcategories (name) VALUES ('Rideshare')`,
    );
    rideshareSubId = Number(ins.lastInsertRowid);
  }

  const transportId = transport.rows[0]?.id
    ? Number(transport.rows[0].id)
    : null;

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            category = 'Travel',
            category_id = ?,
            subcategory = 'Rideshare',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${where}
      `,
      args: [transportId, travelCatId, rideshareSubId, Date.now()],
    });
  }

  const after = await db.execute(`
    SELECT substr(posted, 1, 7) AS month, section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE (
      (posted >= '2026-02-01' AND posted < '2026-03-01')
      OR (posted >= '2026-06-01' AND posted < '2026-07-01')
    )
    AND (
      category = 'Travel' AND subcategory = 'Rideshare'
      OR category = 'Rideshare'
    )
    GROUP BY month, section, category, subcategory
    ORDER BY month
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
