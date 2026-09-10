/**
 * Rebuild accounts/transactions so FKs point at institutions, not plaid_items.
 * Usage: node scripts/rebuild-ledger-fks.mjs
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
});

async function run(sql) {
  await c.execute(sql);
}

await run("PRAGMA busy_timeout = 60000");
await run("PRAGMA journal_mode = WAL");
await run("PRAGMA foreign_keys = OFF");

const before = await c.execute(
  "select (select count(*) from accounts) a, (select count(*) from transactions) t",
);
console.log("before", before.rows[0]);

await run("DROP TABLE IF EXISTS accounts_new");
await run(`
  CREATE TABLE accounts_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL UNIQUE,
    institution_id TEXT NOT NULL REFERENCES institutions(institution_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    official_name TEXT,
    mask TEXT,
    type TEXT,
    subtype TEXT,
    current_balance REAL,
    available_balance REAL,
    iso_currency_code TEXT DEFAULT 'USD',
    updated_at INTEGER NOT NULL
  )
`);
await run(`
  INSERT INTO accounts_new (
    id, account_id, institution_id, name, official_name, mask, type, subtype,
    current_balance, available_balance, iso_currency_code, updated_at
  )
  SELECT
    id, account_id, institution_id, name, official_name, mask, type, subtype,
    current_balance, available_balance, iso_currency_code, updated_at
  FROM accounts
`);
await run("DROP TABLE accounts");
await run("ALTER TABLE accounts_new RENAME TO accounts");
console.log("accounts rebuilt");

await run("DROP TABLE IF EXISTS transactions_new");
await run(`
  CREATE TABLE transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    institution_id TEXT NOT NULL REFERENCES institutions(institution_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    merchant_name TEXT,
    merchant_entity_id TEXT,
    merchant_category_code TEXT,
    original_description TEXT,
    amount REAL NOT NULL,
    iso_currency_code TEXT DEFAULT 'USD',
    date TEXT NOT NULL,
    datetime TEXT,
    authorized_date TEXT,
    authorized_datetime TEXT,
    pending INTEGER NOT NULL DEFAULT 0,
    pending_transaction_id TEXT,
    category_primary TEXT,
    category_detailed TEXT,
    category_confidence TEXT,
    payment_channel TEXT,
    transaction_code TEXT,
    check_number TEXT,
    account_owner TEXT,
    website TEXT,
    logo_url TEXT,
    category_icon_url TEXT,
    location_city TEXT,
    location_region TEXT,
    location_postal_code TEXT,
    location_country TEXT,
    location_lat REAL,
    location_lon REAL,
    location_address TEXT,
    location_store_number TEXT,
    counterparties_json TEXT,
    payment_meta_json TEXT,
    running_balance REAL,
    source TEXT NOT NULL DEFAULT 'statement',
    statement_upload_id INTEGER REFERENCES statement_uploads(id) ON DELETE SET NULL,
    bank_direction TEXT,
    history_match TEXT,
    updated_at INTEGER NOT NULL
  )
`);
await run(`
  INSERT INTO transactions_new (
    id, transaction_id, account_id, institution_id, name, merchant_name,
    merchant_entity_id, merchant_category_code, original_description, amount,
    iso_currency_code, date, datetime, authorized_date, authorized_datetime,
    pending, pending_transaction_id, category_primary, category_detailed,
    category_confidence, payment_channel, transaction_code, check_number,
    account_owner, website, logo_url, category_icon_url, location_city,
    location_region, location_postal_code, location_country, location_lat,
    location_lon, location_address, location_store_number, counterparties_json,
    payment_meta_json, running_balance, source, statement_upload_id,
    bank_direction, history_match, updated_at
  )
  SELECT
    id, transaction_id, account_id, institution_id, name, merchant_name,
    merchant_entity_id, merchant_category_code, original_description, amount,
    iso_currency_code, date, datetime, authorized_date, authorized_datetime,
    pending, pending_transaction_id, category_primary, category_detailed,
    category_confidence, payment_channel, transaction_code, check_number,
    account_owner, website, logo_url, category_icon_url, location_city,
    location_region, location_postal_code, location_country, location_lat,
    location_lon, location_address, location_store_number, counterparties_json,
    payment_meta_json, running_balance, source, statement_upload_id,
    bank_direction, history_match, updated_at
  FROM transactions
`);
await run("DROP TABLE transactions");
await run("ALTER TABLE transactions_new RENAME TO transactions");
console.log("transactions rebuilt");

await run("PRAGMA foreign_keys = ON");
const fk = await c.execute("PRAGMA foreign_key_check");
const after = await c.execute(
  "select (select count(*) from accounts) a, (select count(*) from transactions) t",
);
console.log("after", after.rows[0]);
console.log("fk violations", fk.rows.length);
if (fk.rows.length) {
  console.error(fk.rows.slice(0, 8));
  process.exit(1);
}
if (
  Number(after.rows[0].a) !== Number(before.rows[0].a) ||
  Number(after.rows[0].t) !== Number(before.rows[0].t)
) {
  console.error("row count mismatch");
  process.exit(1);
}
console.log("fks now point at institutions");
