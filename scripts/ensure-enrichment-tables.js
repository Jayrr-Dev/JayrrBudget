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
  aliases_json TEXT,
  source TEXT NOT NULL DEFAULT 'ai',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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
  company_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  brand_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  subsidiary_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  product_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  store_type_node_id INTEGER REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  food_type_node_id INTEGER REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  section_node_id INTEGER REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  category_node_id INTEGER REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  type_node_id INTEGER REFERENCES taxonomy_nodes(id) ON DELETE SET NULL,
  channel TEXT,
  txn_kind TEXT,
  amount_signed REAL,
  amount_abs REAL,
  direction TEXT,
  date_posted TEXT,
  date_authorized TEXT,
  location_city TEXT,
  location_region TEXT,
  location_country TEXT,
  store_number TEXT,
  legal_suffix TEXT,
  parse_tokens_json TEXT,
  enrichment_status TEXT NOT NULL DEFAULT 'pending',
  enrichment_confidence TEXT,
  enrichment_model TEXT,
  enriched_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS transaction_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  node_id INTEGER NOT NULL REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  confidence TEXT,
  source TEXT NOT NULL DEFAULT 'ai',
  created_at INTEGER NOT NULL
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
