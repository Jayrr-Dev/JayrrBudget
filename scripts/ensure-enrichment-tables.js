/**
 * Creates thin enrichment/catalog tables on empty databases.
 * For upgrading an existing fat ledger, run scripts/migrate-atomic-ledger.mjs instead.
 */
const { createClient } = require("@libsql/client");

const client = createClient({
  url: process.env.DATABASE_URL || "file:./data/jayrr-budget.db",
});

const statements = [
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

(async () => {
  for (const sql of statements) {
    await client.execute(sql);
    console.log("created", sql.match(/EXISTS (\w+)/)?.[1]);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
