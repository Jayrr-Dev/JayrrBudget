/**
 * One-shot: replace Plaid tables/columns with institutions + generic ids.
 * Copies live ledger rows, then drops plaid_items.
 *
 * Usage: node scripts/migrate-off-plaid.mjs
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
});

async function tableExists(name) {
  const res = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: [name],
  });
  return res.rows.length > 0;
}

async function columnExists(table, column) {
  const res = await client.execute(`PRAGMA table_info(${table})`);
  return res.rows.some((row) => row.name === column);
}

async function run(sql) {
  await client.execute(sql);
}

async function counts() {
  const items = (await tableExists("plaid_items"))
    ? Number(
        (await client.execute("select count(*) as n from plaid_items")).rows[0]
          .n,
      )
    : 0;
  const institutions = (await tableExists("institutions"))
    ? Number(
        (await client.execute("select count(*) as n from institutions")).rows[0]
          .n,
      )
    : 0;
  const accounts = Number(
    (await client.execute("select count(*) as n from accounts")).rows[0].n,
  );
  const txns = Number(
    (await client.execute("select count(*) as n from transactions")).rows[0].n,
  );
  return { items, institutions, accounts, txns };
}

await run("PRAGMA busy_timeout = 60000");
await run("PRAGMA journal_mode = WAL");

const before = await counts();
console.log("before", before);

if (!(await tableExists("plaid_items")) && (await tableExists("institutions"))) {
  console.log("already migrated");
  process.exit(0);
}

await run("PRAGMA foreign_keys = OFF");

try {
  await run(`
    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  if (await tableExists("plaid_items")) {
    await run(`
      INSERT OR IGNORE INTO institutions (id, institution_id, name, created_at, updated_at)
      SELECT id, item_id, COALESCE(institution_name, 'Unknown'), created_at, updated_at
      FROM plaid_items
    `);
  }

  const accountsNeedRebuild = await columnExists("accounts", "plaid_account_id");
  console.log("rebuild accounts", accountsNeedRebuild);
  if (accountsNeedRebuild) {
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
        id, plaid_account_id, item_id, name, official_name, mask, type, subtype,
        current_balance, available_balance, iso_currency_code, updated_at
      FROM accounts
    `);
    await run("DROP TABLE accounts");
    await run("ALTER TABLE accounts_new RENAME TO accounts");
  }

  const txnsNeedRebuild = await columnExists(
    "transactions",
    "plaid_transaction_id",
  );
  console.log("rebuild transactions", txnsNeedRebuild);
  if (txnsNeedRebuild) {
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
        id, plaid_transaction_id, account_id, item_id, name, merchant_name,
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
  }

  if (await tableExists("plaid_items")) {
    await run("DROP TABLE plaid_items");
  }
} finally {
  await run("PRAGMA foreign_keys = ON");
}

const after = await counts();
console.log("after", after);

if (after.accounts !== before.accounts || after.txns !== before.txns) {
  console.error("row count mismatch");
  process.exit(1);
}
if (after.items !== 0) {
  console.error("plaid_items still present");
  process.exit(1);
}
console.log("migrated off Plaid");
