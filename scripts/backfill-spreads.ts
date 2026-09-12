/**
 * Create transaction_spreads + transactions.spread(_id), then backfill 50/30/20.
 *
 *   npx tsx scripts/backfill-spreads.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { backfillSpreads } from "../src/domains/transactions/application/backfillSpreads";

async function migrate(url: string, authToken: string | undefined) {
  const client = createClient({ url, authToken });

  console.log("--- migrate: transaction_spreads + spread columns ---");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS transaction_spreads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      target_percent INTEGER NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  const cols = await client.execute(`PRAGMA table_info(transactions)`);
  const names = new Set(cols.rows.map((r) => String(r.name)));

  if (!names.has("spread")) {
    await client.execute(`ALTER TABLE transactions ADD COLUMN spread TEXT`);
    console.log("  + transactions.spread");
  } else {
    console.log("  transactions.spread already present");
  }

  if (!names.has("spread_id")) {
    await client.execute(
      `ALTER TABLE transactions ADD COLUMN spread_id INTEGER REFERENCES transaction_spreads(id) ON DELETE SET NULL`,
    );
    console.log("  + transactions.spread_id");
  } else {
    console.log("  transactions.spread_id already present");
  }

  client.close();
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL missing — load .env.local (Turso) before running this script.",
    );
  }
  if (url.startsWith("file:")) {
    throw new Error(
      "Refusing file: DATABASE_URL — use Turso credentials in .env.local.",
    );
  }
  const target = url.replace(/(libsql:\/\/)[^/]+/, "$1***");
  console.log(`backfillSpreads → ${target}`);

  await migrate(url, authToken);
  const result = await backfillSpreads();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
