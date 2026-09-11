/**
 * Copy all rows from local SQLite into Turso.
 *
 * Requires in .env.local:
 *   DATABASE_URL=libsql://….turso.io
 *   DATABASE_AUTH_TOKEN=…
 *   LOCAL_DATABASE_URL=file:./archive/db/jayrr-budget.db   (optional; archived snapshot only)
 *
 * Push schema first: npm run db:push
 * Then: node scripts/push-local-to-turso.mjs
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const remoteUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;
const localUrl =
  process.env.LOCAL_DATABASE_URL ?? "file:./archive/db/jayrr-budget.db";

if (!remoteUrl?.startsWith("libsql://") && !remoteUrl?.startsWith("https://")) {
  console.error("Set DATABASE_URL to your Turso libsql:// URL in .env.local");
  process.exit(1);
}
if (!authToken) {
  console.error("Set DATABASE_AUTH_TOKEN in .env.local");
  process.exit(1);
}

const local = createClient({ url: localUrl });
const remote = createClient({ url: remoteUrl, authToken });

/** Parent tables first so FKs resolve. */
const TABLES = [
  "institutions",
  "accounts",
  "statement_uploads",
  "transactions",
  "transaction_amounts",
  "transaction_dates",
  "transaction_locations",
  "transaction_payment_refs",
  "transaction_bank_categories",
  "entities",
  "entity_aliases",
  "taxonomy_nodes",
  "transaction_enrichment",
  "transaction_entities",
  "enrichment_tokens",
  "transaction_labels",
  "bank_history_files",
  "bank_history_rows",
  "app_modules",
];

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function tableExists(client, name) {
  const res = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: [name],
  });
  return res.rows.length > 0;
}

async function copyTable(name) {
  if (!(await tableExists(local, name))) {
    console.log("skip missing local", name);
    return;
  }
  if (!(await tableExists(remote, name))) {
    console.error("missing remote table", name, "- run npm run db:push first");
    process.exit(1);
  }

  const rows = await local.execute(`SELECT * FROM ${quoteIdent(name)}`);
  if (rows.rows.length === 0) {
    console.log(name, "0 rows");
    return;
  }

  const cols = rows.columns;
  const placeholders = cols.map(() => "?").join(", ");
  const colList = cols.map(quoteIdent).join(", ");
  const sql = `INSERT OR REPLACE INTO ${quoteIdent(name)} (${colList}) VALUES (${placeholders})`;

  const chunk = 100;
  for (let i = 0; i < rows.rows.length; i += chunk) {
    const slice = rows.rows.slice(i, i + chunk);
    await remote.batch(
      slice.map((row) => ({
        sql,
        args: cols.map((col) => row[col]),
      })),
      "write",
    );
  }
  console.log(name, rows.rows.length, "rows");
}

console.log("local", localUrl);
console.log("remote", remoteUrl);

for (const table of TABLES) {
  await copyTable(table);
}

console.log("done");
