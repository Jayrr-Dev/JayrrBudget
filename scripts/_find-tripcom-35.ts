import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const db = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const rows = await db.execute(`
    SELECT id, posted, description, amount, section, category, subcategory, spread, tags, merchant_clean
    FROM transactions
    WHERE description LIKE '%Trip.com%'
       OR description LIKE '%TRIP.COM%'
       OR merchant_clean LIKE '%Trip.com%'
    ORDER BY ABS(amount - 35), posted DESC
  `);
  console.log(rows.rows);

  const inflight = await db.execute(`
    SELECT id, posted, description, amount, section, category, subcategory, tags
    FROM transactions
    WHERE subcategory = 'In-Flight' OR description LIKE '%inflight%' OR description LIKE '%in-flight%'
    ORDER BY posted DESC
    LIMIT 20
  `);
  console.log("existing in-flight", inflight.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
