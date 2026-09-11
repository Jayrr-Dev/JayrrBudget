/**
 * 1) Home Depot → Lifestyle / Shopping / Hardware & Tools
 * 2) Home mobile/wireless → Technology / Mobile & Wireless / Cellphone Plan
 *
 * Usage: npx tsx scripts/fix-home-depot-and-mobile.ts [--run]
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

  const lifestyleId = await ensure(db, "transaction_sections", "Lifestyle");
  const shoppingId = await ensure(db, "transaction_categories", "Shopping");
  const hardwareId = await ensure(
    db,
    "transaction_subcategories",
    "Hardware & Tools",
  );

  const techId = await ensure(db, "transaction_sections", "Technology");
  const mobileCatId = await ensure(
    db,
    "transaction_categories",
    "Mobile & Wireless",
  );
  const planId = await ensure(
    db,
    "transaction_subcategories",
    "Cellphone Plan",
  );

  const depotWhere = `
    lower(coalesce(merchant_clean,'')) LIKE '%home depot%'
    OR lower(coalesce(description,'')) LIKE '%home depot%'
    OR lower(coalesce(description,'')) LIKE '%homedepot%'
  `;
  const mobileWhere = `
    section = 'Home'
    AND (
      subcategory = 'Mobile & Wireless'
      OR category = 'Utilities & Telecom'
    )
  `;

  const depotCount = await db.execute(
    `SELECT COUNT(*) AS c FROM transactions WHERE ${depotWhere}`,
  );
  const mobileCount = await db.execute(
    `SELECT COUNT(*) AS c FROM transactions WHERE ${mobileWhere}`,
  );
  console.log(`Home Depot rows: ${depotCount.rows[0]?.c}`);
  console.log(`Home mobile/telecom rows: ${mobileCount.rows[0]?.c}`);

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Lifestyle',
            section_id = ?,
            category = 'Shopping',
            category_id = ?,
            subcategory = 'Hardware & Tools',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${depotWhere}
      `,
      args: [
        lifestyleId > 0 ? lifestyleId : null,
        shoppingId > 0 ? shoppingId : null,
        hardwareId > 0 ? hardwareId : null,
        Date.now(),
      ],
    });

    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Technology',
            section_id = ?,
            category = 'Mobile & Wireless',
            category_id = ?,
            subcategory = 'Cellphone Plan',
            subcategory_id = ?,
            updated_at = ?
        WHERE ${mobileWhere}
      `,
      args: [
        techId > 0 ? techId : null,
        mobileCatId > 0 ? mobileCatId : null,
        planId > 0 ? planId : null,
        Date.now(),
      ],
    });
  }

  console.log("\nafter Home Depot:");
  const hd = await db.execute(`
    SELECT section, category, subcategory, merchant_clean, COUNT(*) c
    FROM transactions WHERE ${depotWhere}
    GROUP BY section, category, subcategory, merchant_clean
  `);
  for (const r of hd.rows) console.log(r);

  console.log("\nafter mobile:");
  const mob = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) c
    FROM transactions
    WHERE category = 'Mobile & Wireless' OR subcategory = 'Cellphone Plan'
    GROUP BY section, category, subcategory
  `);
  for (const r of mob.rows) console.log(r);

  const homeLeft = await db.execute(
    `SELECT COUNT(*) c FROM transactions WHERE section = 'Home'`,
  );
  console.log(`\nHome section rows left: ${homeLeft.rows[0]?.c}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
