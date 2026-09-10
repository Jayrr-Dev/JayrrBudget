/**
 * Migrate fat ledger/enrichment rows to atomic tables + thin transactions.
 * Safe to re-run: skips steps when the target shape is already present.
 *
 * Usage: node scripts/migrate-atomic-ledger.mjs
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

async function run(sql, args = []) {
  await client.execute({ sql, args });
}

async function count(table) {
  if (!(await tableExists(table))) return 0;
  const res = await client.execute(`SELECT count(*) AS n FROM ${table}`);
  return Number(res.rows[0].n);
}

const ATOM_DDL = [
  `CREATE TABLE IF NOT EXISTS transaction_amounts (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    amount_minor INTEGER NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'CAD',
    running_balance_minor INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_dates (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    posted_date TEXT NOT NULL,
    authorized_date TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_locations (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    city TEXT,
    region TEXT,
    country TEXT,
    postal_code TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_payment_refs (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    check_number TEXT,
    reference_number TEXT,
    transaction_code TEXT,
    payment_channel TEXT,
    foreign_amount_minor INTEGER,
    foreign_currency TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_bank_categories (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    category_primary TEXT,
    category_detailed TEXT,
    category_confidence TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    parent_entity_id INTEGER,
    website TEXT,
    logo_url TEXT,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS entity_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at INTEGER NOT NULL,
    UNIQUE(entity_id, alias)
  )`,
  `CREATE TABLE IF NOT EXISTS taxonomy_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facet TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent_id INTEGER,
    path TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_enrichment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    merchant_raw TEXT,
    merchant_clean TEXT,
    channel TEXT,
    txn_kind TEXT,
    store_number TEXT,
    legal_suffix TEXT,
    enrichment_status TEXT NOT NULL DEFAULT 'pending',
    enrichment_confidence TEXT,
    enrichment_model TEXT,
    enriched_at INTEGER,
    error TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    confidence TEXT,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at INTEGER NOT NULL,
    UNIQUE(transaction_id, role)
  )`,
  `CREATE TABLE IF NOT EXISTS enrichment_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    confidence TEXT,
    source TEXT NOT NULL DEFAULT 'ai',
    created_at INTEGER NOT NULL,
    UNIQUE(transaction_id, node_id, role)
  )`,
];

async function ensureAtomTables() {
  for (const sql of ATOM_DDL) {
    await run(sql);
  }
  console.log("atom/catalog tables ensured");
}

async function backfillAtomsFromFatTransactions() {
  const hasAmount = await columnExists("transactions", "amount");
  if (!hasAmount) {
    console.log("transactions already slim; skip atom backfill");
    return;
  }

  await run(`
    INSERT OR IGNORE INTO transaction_amounts (transaction_id, amount_minor, currency_code, running_balance_minor)
    SELECT
      id,
      CAST(ROUND(amount * 100) AS INTEGER),
      COALESCE(iso_currency_code, 'CAD'),
      CASE WHEN running_balance IS NOT NULL THEN CAST(ROUND(running_balance * 100) AS INTEGER) ELSE NULL END
    FROM transactions
    WHERE amount IS NOT NULL
  `);

  await run(`
    INSERT OR IGNORE INTO transaction_dates (transaction_id, posted_date, authorized_date)
    SELECT id, date, authorized_date
    FROM transactions
    WHERE date IS NOT NULL
  `);

  await run(`
    INSERT OR IGNORE INTO transaction_locations (transaction_id, city, region, country, postal_code)
    SELECT id, location_city, location_region, location_country, location_postal_code
    FROM transactions
    WHERE location_city IS NOT NULL
       OR location_region IS NOT NULL
       OR location_country IS NOT NULL
       OR location_postal_code IS NOT NULL
  `);

  await run(`
    INSERT OR IGNORE INTO transaction_payment_refs (
      transaction_id, check_number, transaction_code, payment_channel
    )
    SELECT id, check_number, transaction_code, payment_channel
    FROM transactions
    WHERE check_number IS NOT NULL
       OR transaction_code IS NOT NULL
       OR payment_channel IS NOT NULL
  `);

  await run(`
    INSERT OR IGNORE INTO transaction_bank_categories (
      transaction_id, category_primary, category_detailed, category_confidence
    )
    SELECT id, category_primary, category_detailed, category_confidence
    FROM transactions
    WHERE category_primary IS NOT NULL
       OR category_detailed IS NOT NULL
       OR category_confidence IS NOT NULL
  `);

  console.log("backfilled atom rows from fat transactions");
}

async function rebuildSlimTransactions() {
  const hasAmount = await columnExists("transactions", "amount");
  const hasDescription = await columnExists("transactions", "description");
  if (!hasAmount || hasDescription) {
    console.log("transactions rebuild skipped");
    return;
  }

  const before = await count("transactions");
  await run("DROP TABLE IF EXISTS transactions_new");
  await run(`
    CREATE TABLE transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      pending INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'statement',
      statement_upload_id INTEGER REFERENCES statement_uploads(id) ON DELETE SET NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await run(`
    INSERT INTO transactions_new (
      id, transaction_id, account_id, description, pending, source, statement_upload_id, updated_at
    )
    SELECT
      id,
      transaction_id,
      account_id,
      COALESCE(original_description, name, ''),
      pending,
      COALESCE(source, 'statement'),
      statement_upload_id,
      updated_at
    FROM transactions
  `);
  await run("DROP TABLE transactions");
  await run("ALTER TABLE transactions_new RENAME TO transactions");
  const after = await count("transactions");
  if (before !== after) {
    throw new Error(`transaction row count mismatch ${before} -> ${after}`);
  }
  console.log("rebuilt slim transactions");
}

async function migrateFatEnrichment() {
  if (!(await tableExists("transaction_enrichment"))) return;

  const fat =
    (await columnExists("transaction_enrichment", "company_entity_id")) ||
    (await columnExists("transaction_enrichment", "amount_signed")) ||
    (await columnExists("transaction_enrichment", "parse_tokens_json"));

  if (!fat) {
    console.log("transaction_enrichment already thin");
    return;
  }

  const entityRoles = [
    ["company_entity_id", "company"],
    ["brand_entity_id", "brand"],
    ["subsidiary_entity_id", "subsidiary"],
    ["product_entity_id", "product"],
  ];
  for (const [col, role] of entityRoles) {
    if (!(await columnExists("transaction_enrichment", col))) continue;
    await run(`
      INSERT OR IGNORE INTO transaction_entities (transaction_id, entity_id, role, source, created_at)
      SELECT transaction_id, ${col}, '${role}', 'ai', updated_at
      FROM transaction_enrichment
      WHERE ${col} IS NOT NULL
    `);
  }

  const labelRoles = [
    ["store_type_node_id", "store_type"],
    ["food_type_node_id", "food_type"],
    ["section_node_id", "section"],
    ["category_node_id", "category"],
    ["type_node_id", "type"],
  ];
  for (const [col, role] of labelRoles) {
    if (!(await columnExists("transaction_enrichment", col))) continue;
    await run(`
      INSERT OR IGNORE INTO transaction_labels (transaction_id, node_id, role, source, created_at)
      SELECT transaction_id, ${col}, '${role}', 'ai', updated_at
      FROM transaction_enrichment
      WHERE ${col} IS NOT NULL
    `);
  }

  if (await columnExists("transaction_enrichment", "parse_tokens_json")) {
    const res = await client.execute(`
      SELECT transaction_id, parse_tokens_json
      FROM transaction_enrichment
      WHERE parse_tokens_json IS NOT NULL AND trim(parse_tokens_json) != ''
    `);
    for (const row of res.rows) {
      const txnId = Number(row.transaction_id);
      const existing = await client.execute({
        sql: "SELECT count(*) AS n FROM enrichment_tokens WHERE transaction_id = ?",
        args: [txnId],
      });
      if (Number(existing.rows[0].n) > 0) continue;

      let tokens;
      try {
        tokens = JSON.parse(String(row.parse_tokens_json));
      } catch {
        continue;
      }
      if (!Array.isArray(tokens)) continue;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token == null || String(token).trim() === "") continue;
        await run(
          "INSERT INTO enrichment_tokens (transaction_id, token, sort_order) VALUES (?, ?, ?)",
          [txnId, String(token), i],
        );
      }
    }
  }

  const before = await count("transaction_enrichment");
  await run("DROP TABLE IF EXISTS transaction_enrichment_new");
  await run(`
    CREATE TABLE transaction_enrichment_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      merchant_raw TEXT,
      merchant_clean TEXT,
      channel TEXT,
      txn_kind TEXT,
      store_number TEXT,
      legal_suffix TEXT,
      enrichment_status TEXT NOT NULL DEFAULT 'pending',
      enrichment_confidence TEXT,
      enrichment_model TEXT,
      enriched_at INTEGER,
      error TEXT,
      updated_at INTEGER NOT NULL
    )
  `);
  await run(`
    INSERT INTO transaction_enrichment_new (
      id, transaction_id, merchant_raw, merchant_clean, channel, txn_kind,
      store_number, legal_suffix, enrichment_status, enrichment_confidence,
      enrichment_model, enriched_at, error, updated_at
    )
    SELECT
      id, transaction_id, merchant_raw, merchant_clean, channel, txn_kind,
      store_number, legal_suffix, enrichment_status, enrichment_confidence,
      enrichment_model, enriched_at, error, updated_at
    FROM transaction_enrichment
  `);
  await run("DROP TABLE transaction_enrichment");
  await run("ALTER TABLE transaction_enrichment_new RENAME TO transaction_enrichment");
  const after = await count("transaction_enrichment");
  if (before !== after) {
    throw new Error(`enrichment row count mismatch ${before} -> ${after}`);
  }
  console.log("rebuilt thin transaction_enrichment");
}

async function ensureStatementUploadAccountId() {
  if (!(await tableExists("statement_uploads"))) return;
  if (await columnExists("statement_uploads", "account_id")) {
    console.log("statement_uploads.account_id already present");
    return;
  }
  await run(
    "ALTER TABLE statement_uploads ADD COLUMN account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL",
  );
  console.log("added statement_uploads.account_id");
}

async function ensureBankHistoryDirection() {
  if (!(await tableExists("bank_history_rows"))) return;
  if (await columnExists("bank_history_rows", "bank_direction")) {
    console.log("bank_history_rows.bank_direction already present");
    return;
  }
  await run("ALTER TABLE bank_history_rows ADD COLUMN bank_direction TEXT");
  console.log("added bank_history_rows.bank_direction");
}

async function ensureEntityWebsiteColumns() {
  if (!(await tableExists("entities"))) return;
  if (!(await columnExists("entities", "website"))) {
    await run("ALTER TABLE entities ADD COLUMN website TEXT");
    console.log("added entities.website");
  }
  if (!(await columnExists("entities", "logo_url"))) {
    await run("ALTER TABLE entities ADD COLUMN logo_url TEXT");
    console.log("added entities.logo_url");
  }
}

async function migrateEntityAliasesJson() {
  if (!(await tableExists("entities"))) return;
  if (!(await columnExists("entities", "aliases_json"))) {
    console.log("entities.aliases_json already absent");
    return;
  }
  if (!(await tableExists("entity_aliases"))) return;

  const rows = await client.execute(
    "SELECT id, aliases_json FROM entities WHERE aliases_json IS NOT NULL AND length(trim(aliases_json)) > 0",
  );
  let inserted = 0;
  for (const row of rows.rows) {
    let aliases = [];
    try {
      const parsed = JSON.parse(String(row.aliases_json));
      if (Array.isArray(parsed)) aliases = parsed.map(String);
    } catch {
      continue;
    }
    for (const alias of aliases) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      try {
        await run(
          `INSERT OR IGNORE INTO entity_aliases (entity_id, alias, source, created_at)
           VALUES (?, ?, 'migrate', ?)`,
          [row.id, trimmed, Date.now()],
        );
        inserted += 1;
      } catch {
        // ignore
      }
    }
  }
  console.log("migrated entity aliases", inserted);
}

async function dropBankHistorySourceFilename() {
  if (!(await tableExists("bank_history_rows"))) return;
  if (!(await columnExists("bank_history_rows", "source_filename"))) {
    console.log("bank_history_rows.source_filename already absent");
    return;
  }

  const before = await count("bank_history_rows");
  await run("DROP TABLE IF EXISTS bank_history_rows_new");
  await run(`
    CREATE TABLE bank_history_rows_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES bank_history_files(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL UNIQUE,
      account_mask TEXT NOT NULL,
      account_type TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      debit REAL,
      credit REAL,
      direction TEXT NOT NULL,
      amount REAL NOT NULL,
      card_number TEXT,
      matched_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      bank_direction TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  await run(`
    INSERT INTO bank_history_rows_new (
      id, file_id, fingerprint, account_mask, account_type, date, description,
      debit, credit, direction, amount, card_number, matched_transaction_id,
      match_status, bank_direction, created_at
    )
    SELECT
      id, file_id, fingerprint, account_mask, account_type, date, description,
      debit, credit, direction, amount, card_number, matched_transaction_id,
      match_status, bank_direction, created_at
    FROM bank_history_rows
  `);
  await run("DROP TABLE bank_history_rows");
  await run("ALTER TABLE bank_history_rows_new RENAME TO bank_history_rows");
  const after = await count("bank_history_rows");
  if (before !== after) {
    throw new Error(`bank_history_rows count mismatch ${before} -> ${after}`);
  }
  console.log("dropped bank_history_rows.source_filename");
}

await run("PRAGMA busy_timeout = 60000");
await run("PRAGMA journal_mode = WAL");

const txnBefore = await count("transactions");
console.log("before transactions", txnBefore);

await run("PRAGMA foreign_keys = OFF");
try {
  await ensureAtomTables();
  await ensureEntityWebsiteColumns();
  await migrateEntityAliasesJson();
  await backfillAtomsFromFatTransactions();
  await rebuildSlimTransactions();
  await migrateFatEnrichment();
  await ensureStatementUploadAccountId();
  await ensureBankHistoryDirection();
  await dropBankHistorySourceFilename();
} finally {
  await run("PRAGMA foreign_keys = ON");
}

const txnAfter = await count("transactions");
const fk = await client.execute("PRAGMA foreign_key_check");
console.log("after transactions", txnAfter);
console.log("fk violations", fk.rows.length);
if (fk.rows.length) {
  console.error(fk.rows.slice(0, 8));
  process.exit(1);
}
if (txnBefore !== txnAfter) {
  console.error("transaction count changed unexpectedly");
  process.exit(1);
}
console.log("atomic ledger migration complete");
