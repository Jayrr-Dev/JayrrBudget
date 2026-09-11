import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

async function ensure(
  db: ReturnType<typeof createClient>,
  table: string,
  name: string,
) {
  const hit = await db.execute({
    sql: `SELECT id FROM ${table} WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (hit.rows[0]?.id != null) return Number(hit.rows[0].id);
  const ins = await db.execute({
    sql: `INSERT INTO ${table} (name) VALUES (?)`,
    args: [name],
  });
  return Number(ins.lastInsertRowid);
}

async function main() {
  const db = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const sectionId = await ensure(db, "transaction_sections", "Finance");
  const catId = await ensure(db, "transaction_categories", "Insurance");
  const subId = await ensure(
    db,
    "transaction_subcategories",
    "Property & Auto Insurance",
  );

  await db.execute({
    sql: `
      UPDATE transactions
      SET section = 'Finance',
          section_id = ?,
          category = 'Insurance',
          category_id = ?,
          subcategory = 'Property & Auto Insurance',
          subcategory_id = ?,
          updated_at = ?
      WHERE id = 1363
         OR lower(coalesce(merchant_clean,'')) LIKE '%west-end registr%'
         OR lower(coalesce(description,'')) LIKE '%west-end registr%'
    `,
    args: [sectionId, catId, subId, Date.now()],
  });

  const after = await db.execute(`
    SELECT section, category, subcategory, merchant_clean, description, amount
    FROM transactions
    WHERE id = 1363
       OR lower(coalesce(merchant_clean,'')) LIKE '%west-end registr%'
  `);
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
