/**
 * Kill deprecated sections:
 * - Entertainment & Travel → remap Flights to Transport, then delete section
 * - _Retired Travel → re-point leftover categories, then delete
 * Also drop unused _Retired* categories.
 *
 * Usage: npx tsx scripts/purge-deprecated-sections.ts --run
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
  console.log("URL", url);

  const transport = await db.execute(
    `SELECT id FROM transaction_sections WHERE name = 'Transport' LIMIT 1`,
  );
  const lifestyle = await db.execute(
    `SELECT id FROM transaction_sections WHERE name = 'Lifestyle' LIMIT 1`,
  );
  const transportId = Number(transport.rows[0]?.id);
  const lifestyleId = Number(lifestyle.rows[0]?.id);
  if (!transportId || !lifestyleId) {
    throw new Error(`Missing Transport/Lifestyle ids: ${transportId}/${lifestyleId}`);
  }

  const beforeEnt = await db.execute(`
    SELECT id, description, section, category, subcategory, tags
    FROM transactions
    WHERE section = 'Entertainment & Travel' OR section_id = (
      SELECT id FROM transaction_sections WHERE name = 'Entertainment & Travel'
    )
  `);
  console.log("Entertainment & Travel txns before:", beforeEnt.rows);

  if (APPLY) {
    const now = Date.now();

    // 1) Trip.com / any leftover Entertainment & Travel → Transport/Flights
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            category = COALESCE(category, 'Flights'),
            category_id = COALESCE(
              category_id,
              (SELECT id FROM transaction_categories WHERE name = 'Flights' LIMIT 1)
            ),
            updated_at = ?
        WHERE section = 'Entertainment & Travel'
           OR section_id = (
             SELECT id FROM transaction_sections WHERE name = 'Entertainment & Travel'
           )
      `,
      args: [transportId, now],
    });

    // 2) Point live categories off _Retired Travel
    await db.execute({
      sql: `UPDATE transaction_categories SET section_id = ? WHERE name = 'Flights'`,
      args: [transportId],
    });
    await db.execute({
      sql: `UPDATE transaction_categories SET section_id = ? WHERE name IN ('Lodging','Sightseeing','Attractions & Tours')`,
      args: [lifestyleId],
    });
    await db.execute({
      sql: `UPDATE transaction_categories SET section_id = ? WHERE name IN ('Rentals','Vehicle')`,
      args: [transportId],
    });

    // 3) Delete deprecated sections (no txn refs after remap)
    await db.execute(
      `DELETE FROM transaction_sections WHERE name IN ('Entertainment & Travel', '_Retired Travel')`,
    );

    // 4) Delete unused retired categories (no txn refs)
    await db.execute(`
      DELETE FROM transaction_categories
      WHERE name IN (
        '_Retired Lodging',
        '_Retired Restaurants & Cafes',
        '_Retired Travel Category'
      )
      AND id NOT IN (
        SELECT DISTINCT category_id FROM transactions WHERE category_id IS NOT NULL
      )
    `);
  }

  const after743 = await db.execute(
    `SELECT id, description, section, category, subcategory, spread, tags FROM transactions WHERE id = 743`,
  );
  console.log("txn 743 after:", after743.rows);

  const sections = await db.execute(`
    SELECT s.id, s.name,
      (SELECT COUNT(*) FROM transactions t WHERE t.section = s.name OR t.section_id = s.id) AS txn_c
    FROM transaction_sections s
    ORDER BY s.name
  `);
  console.log("sections left:", sections.rows);

  const retiredLeft = await db.execute(`
    SELECT name FROM transaction_categories WHERE name LIKE '\\_%' ESCAPE '\\'
    UNION ALL
    SELECT name FROM transaction_sections WHERE name LIKE '\\_%' ESCAPE '\\' OR name = 'Entertainment & Travel'
  `);
  console.log("retired/deprecated names left:", retiredLeft.rows);

  const flights = await db.execute(`
    SELECT c.id, c.name, c.section_id, s.name AS section_name
    FROM transaction_categories c
    LEFT JOIN transaction_sections s ON s.id = c.section_id
    WHERE c.name = 'Flights'
  `);
  console.log("Flights category:", flights.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
