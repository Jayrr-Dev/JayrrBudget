import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

async function main() {
  const APPLY = process.argv.includes("--run");
  const db = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const before = await db.execute(`
    SELECT section, category, COUNT(*) AS c
    FROM transactions
    WHERE lower(category) LIKE '%rideshare%'
       OR lower(kind) LIKE '%rideshare%'
       OR lower(subcategory) LIKE '%rideshare%'
       OR lower(description) LIKE '%uber%'
       OR lower(merchant_clean) LIKE '%uber%'
       OR lower(merchant_clean) LIKE '%lyft%'
    GROUP BY section, category
    ORDER BY c DESC
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  const transport = await db.execute(
    `SELECT id FROM transaction_sections WHERE name = 'Transport' LIMIT 1`,
  );
  let transportId = transport.rows[0]?.id
    ? Number(transport.rows[0].id)
    : null;
  if (!transportId) {
    console.log("create Transport section");
    if (APPLY) {
      const ins = await db.execute(
        `INSERT INTO transaction_sections (name) VALUES ('Transport')`,
      );
      transportId = Number(ins.lastInsertRowid);
    }
  }

  // Move rows whose category is Rideshare (or rideshare-ish category name)
  const targets = await db.execute(`
    SELECT id, section, category, merchant_clean, description
    FROM transactions
    WHERE lower(coalesce(category,'')) = 'rideshare'
       OR lower(coalesce(category,'')) LIKE '%rideshare%'
  `);
  console.log(`rows to move by category: ${targets.rows.length}`);

  if (APPLY && transportId != null) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            updated_at = ?
        WHERE lower(coalesce(category,'')) = 'rideshare'
           OR lower(coalesce(category,'')) LIKE '%rideshare%'
      `,
      args: [transportId, Date.now()],
    });
  }

  const after = await db.execute(`
    SELECT section, category, COUNT(*) AS c
    FROM transactions
    WHERE lower(coalesce(category,'')) LIKE '%rideshare%'
    GROUP BY section, category
    ORDER BY c DESC
  `);
  console.log("after:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
