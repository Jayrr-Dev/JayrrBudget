/**
 * Trip.com $35.10 → Transport / Flights / In-Flight (in-flight internet).
 * Usage: npx tsx scripts/fix-tripcom-inflight.ts --run
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: ".env.local" });

const APPLY = process.argv.includes("--run");
const TXN_ID = 586;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const before = await db.execute({
    sql: `SELECT id, posted, description, amount, section, category, subcategory, spread, tags
          FROM transactions WHERE id = ?`,
    args: [TXN_ID],
  });
  console.log("before", before.rows[0]);

  const transport = await db.execute(
    `SELECT id FROM transaction_sections WHERE name = 'Transport' LIMIT 1`,
  );
  const flights = await db.execute(
    `SELECT id FROM transaction_categories WHERE name = 'Flights' LIMIT 1`,
  );
  const inflight = await db.execute(
    `SELECT id FROM transaction_subcategories WHERE name = 'In-Flight' LIMIT 1`,
  );
  const wants = await db.execute(
    `SELECT id FROM transaction_spreads WHERE name = 'Wants' LIMIT 1`,
  );

  const sectionId = Number(transport.rows[0]?.id);
  const categoryId = Number(flights.rows[0]?.id);
  const subcategoryId = Number(inflight.rows[0]?.id);
  const spreadId = Number(wants.rows[0]?.id);
  if (!sectionId || !categoryId || !subcategoryId) {
    throw new Error(
      `Missing ids section=${sectionId} cat=${categoryId} sub=${subcategoryId}`,
    );
  }

  if (APPLY) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            category = 'Flights',
            category_id = ?,
            subcategory = 'In-Flight',
            subcategory_id = ?,
            spread = 'Wants',
            spread_id = ?,
            tags = 'Travel, Philippines Trip 2026',
            merchant_clean = 'Trip.com',
            updated_at = ?
        WHERE id = ?
      `,
      args: [
        sectionId,
        categoryId,
        subcategoryId,
        spreadId || null,
        Date.now(),
        TXN_ID,
      ],
    });
  }

  const after = await db.execute({
    sql: `SELECT id, posted, description, amount, section, category, subcategory, spread, tags, merchant_clean
          FROM transactions WHERE id = ?`,
    args: [TXN_ID],
  });
  console.log("after", after.rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
