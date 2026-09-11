import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { backfillTransactionTypes } from "../src/domains/enrichment/application/backfillTransactionTypes";

async function queryDb(label: string, url: string, authToken?: string) {
  const client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });
  const [txns, labels, byType, nodes] = await Promise.all([
    client.execute("SELECT count(*) as cnt FROM transactions"),
    client.execute(`
      SELECT count(*) as cnt
      FROM transaction_labels tl
      JOIN taxonomy_nodes tn ON tn.id = tl.node_id
      WHERE tl.role = 'transaction_type'
    `),
    client.execute(`
      SELECT tn.name, count(*) as cnt
      FROM transaction_labels tl
      JOIN taxonomy_nodes tn ON tn.id = tl.node_id
      WHERE tl.role = 'transaction_type'
      GROUP BY tn.name
      ORDER BY tn.name
    `),
    client.execute(`
      SELECT count(*) as cnt FROM taxonomy_nodes WHERE facet = 'transaction_type'
    `),
  ]);

  console.log(`=== ${label} ===`);
  console.log("URL:", url.startsWith("file:") ? url : url.replace(/(libsql:\/\/)[^/]+/, "$1***"));
  console.log("transactions:", txns.rows[0].cnt);
  console.log("transaction_type labels:", labels.rows[0].cnt);
  console.log("by type:", byType.rows);
  console.log("transaction_type nodes:", nodes.rows[0].cnt);

  const nodeDetail = await client.execute(`
    SELECT id, facet, slug, name
    FROM taxonomy_nodes
    WHERE facet = 'transaction_type'
       OR slug IN ('income', 'transfers', 'expenses')
    ORDER BY facet, name
  `);
  console.log("node detail:", nodeDetail.rows);
}

async function main() {
  const tursoUrl = process.env.DATABASE_URL;
  const tursoToken = process.env.DATABASE_AUTH_TOKEN;

  if (!tursoUrl) {
    throw new Error("DATABASE_URL missing from .env.local");
  }

  await queryDb("TURSO (.env.local)", tursoUrl, tursoToken);

  const run = process.argv.includes("--run");
  if (!run) {
    console.log("\nPass --run to backfill on Turso (.env.local DATABASE_URL).");
    return;
  }

  console.log("\nRunning backfillTransactionTypes on", tursoUrl.replace(/(libsql:\/\/)[^/]+/, "$1***"));
  const result = await backfillTransactionTypes();
  console.log("backfill result:", result);

  await queryDb("TURSO after backfill", tursoUrl, tursoToken);

  const client = createClient({
    url: tursoUrl,
    ...(tursoToken ? { authToken: tursoToken } : {}),
  });
  const nodes = await client.execute(`
    SELECT id, facet, slug, name
    FROM taxonomy_nodes
    WHERE facet = 'transaction_type'
    ORDER BY name
  `);
  console.log("transaction_type nodes detail:", nodes.rows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
