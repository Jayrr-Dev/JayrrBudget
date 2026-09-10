const { createClient } = require("@libsql/client");

const client = createClient({
  url: process.env.DATABASE_URL || "file:./data/jayrr-budget.db",
});

(async () => {
  await client.execute(`CREATE TABLE IF NOT EXISTS app_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  href TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'IconPuzzle',
  category TEXT NOT NULL DEFAULT 'core',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_core INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
  console.log("created app_modules");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
