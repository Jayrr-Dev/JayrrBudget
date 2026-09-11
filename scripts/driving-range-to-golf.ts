import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

async function main() {
  const db = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  let golfId: number;
  const g = await db.execute(
    `SELECT id FROM transaction_subcategories WHERE name = 'Golf' LIMIT 1`,
  );
  if (g.rows[0]?.id != null) {
    golfId = Number(g.rows[0].id);
  } else {
    const ins = await db.execute(
      `INSERT INTO transaction_subcategories (name) VALUES ('Golf')`,
    );
    golfId = Number(ins.lastInsertRowid);
  }

  await db.execute({
    sql: `
      UPDATE transactions
      SET subcategory = 'Golf',
          subcategory_id = ?,
          updated_at = ?
      WHERE subcategory = 'Driving Range'
         OR lower(coalesce(merchant_clean,'')) LIKE '%driving range%'
         OR lower(coalesce(description,'')) LIKE '%driving range%'
    `,
    args: [golfId, Date.now()],
  });

  const after = await db.execute(`
    SELECT section, category, subcategory, merchant_clean, COUNT(*) AS c
    FROM transactions
    WHERE subcategory = 'Golf'
    GROUP BY section, category, subcategory, merchant_clean
  `);
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
