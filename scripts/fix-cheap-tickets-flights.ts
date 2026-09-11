/**
 * Move Cheap Tickets Deal txn(s) to Travel / Flights / Airline Tickets.
 * Usage: npx tsx scripts/fix-cheap-tickets-flights.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso URL, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const travel = await db.execute(
    `SELECT id FROM taxonomy_nodes WHERE facet = 'section' AND slug = 'travel' LIMIT 1`,
  );
  const flights = await db.execute(
    `SELECT id FROM taxonomy_nodes WHERE facet = 'category' AND slug = 'flights' LIMIT 1`,
  );
  const airline = await db.execute(
    `SELECT id FROM taxonomy_nodes WHERE facet = 'subcategory' AND slug = 'airline-tickets' LIMIT 1`,
  );
  const travelId = Number(travel.rows[0]?.id);
  const flightsId = Number(flights.rows[0]?.id);
  const airlineId = Number(airline.rows[0]?.id);
  if (!travelId || !flightsId || !airlineId) {
    throw new Error(`Missing nodes travel=${travelId} flights=${flightsId} airline=${airlineId}`);
  }
  console.log({ travelId, flightsId, airlineId });

  const txns = await db.execute(`
    SELECT t.id
    FROM transactions t
    LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
    WHERE t.description LIKE '%CHEAP TICKETS%'
       OR te.merchant_clean LIKE '%Cheap Tickets%'
       OR te.merchant_raw LIKE '%CHEAP TICKETS%'
  `);

  for (const row of txns.rows) {
    const txnId = Number(row.id);
    console.log(`txn ${txnId}`);

    // Drop existing section/category/subcategory labels (dedupe too).
    const existing = await db.execute({
      sql: `SELECT tl.id, tl.role, tn.name FROM transaction_labels tl
            JOIN taxonomy_nodes tn ON tn.id = tl.node_id
            WHERE tl.transaction_id = ? AND tl.role IN ('section','category','subcategory')`,
      args: [txnId],
    });
    for (const e of existing.rows) {
      console.log(`  drop ${e.role}:${e.name}`);
      if (APPLY) {
        await db.execute({
          sql: `DELETE FROM transaction_labels WHERE id = ?`,
          args: [e.id],
        });
      }
    }

    const inserts: Array<[string, number]> = [
      ["section", travelId],
      ["category", flightsId],
      ["subcategory", airlineId],
    ];
    for (const [role, nodeId] of inserts) {
      console.log(`  add ${role} → node ${nodeId}`);
      if (APPLY) {
        await db.execute({
          sql: `INSERT INTO transaction_labels (transaction_id, node_id, role, source, confidence, created_at)
                VALUES (?, ?, ?, 'rule', '1', ?)`,
          args: [txnId, nodeId, role, Date.now()],
        });
      }
    }
  }

  const verify = await db.execute(`
    SELECT t.id, t.description,
           GROUP_CONCAT(tl.role || ':' || tn.name, ' | ') AS labels
    FROM transactions t
    LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
    LEFT JOIN transaction_labels tl ON tl.transaction_id = t.id
    LEFT JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE t.description LIKE '%CHEAP TICKETS%'
       OR te.merchant_clean LIKE '%Cheap Tickets%'
    GROUP BY t.id
  `);
  console.log("\nafter:");
  for (const r of verify.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
