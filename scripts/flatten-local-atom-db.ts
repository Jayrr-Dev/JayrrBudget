/**
 * Convert local atom-schema DB → flat transactions schema expected by the app.
 *
 * Usage:
 *   npx tsx scripts/flatten-local-atom-db.ts
 *   npx tsx scripts/flatten-local-atom-db.ts --run
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type Client, type InArgs } from "@libsql/client";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--run");

const DROP_ATOM = [
  "transaction_labels",
  "taxonomy_nodes",
  "transaction_entities",
  "entity_aliases",
  "entities",
  "enrichment_tokens",
  "transaction_enrichment",
  "transaction_bank_categories",
  "transaction_payment_refs",
  "transaction_locations",
  "transaction_dates",
  "transaction_amounts",
  "bank_history_rows",
  "bank_history_files",
  "t",
];

function money(minor: unknown): number {
  const n = Number(minor ?? 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

function inferTxnType(section: string | null): string | null {
  if (!section) return null;
  const s = section.toLowerCase();
  if (s === "income") return "income";
  if (s === "transfers") return "transfers";
  return "expenses";
}

async function ensureLookup(
  db: Client,
  table: string,
  name: string,
  cache: Map<string, number>,
): Promise<number> {
  const key = name.trim();
  const hit = cache.get(key.toLowerCase());
  if (hit != null) return hit;
  const existing = await db.execute({
    sql: `SELECT id FROM ${table} WHERE name = ? LIMIT 1`,
    args: [key],
  });
  if (existing.rows[0]?.id != null) {
    const id = Number(existing.rows[0].id);
    cache.set(key.toLowerCase(), id);
    return id;
  }
  const ins = await db.execute({
    sql: `INSERT INTO ${table} (name) VALUES (?)`,
    args: [key],
  });
  const id = Number(ins.lastInsertRowid);
  cache.set(key.toLowerCase(), id);
  return id;
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.startsWith("file:")) {
    throw new Error(
      `This script only flattens a local file DB. Got: ${url ?? "(unset)"}`,
    );
  }

  const filePath = url.replace(/^file:/, "");
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  if (!existsSync(abs)) throw new Error(`DB file missing: ${abs}`);

  console.log(`DB: ${abs}`);
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run (pass --run)");

  const db = createClient({ url });

  const info = await db.execute("PRAGMA table_info(transactions)");
  const cols = new Set(info.rows.map((r) => String(r.name)));
  if (cols.has("posted") && cols.has("amount") && cols.has("merchant_clean")) {
    console.log("Already flat (has posted/amount/merchant_clean). Nothing to do.");
    return;
  }
  if (!cols.has("transaction_id") || !cols.has("account_id")) {
    throw new Error("Unexpected transactions shape; aborting.");
  }

  const count = await db.execute("SELECT COUNT(*) AS c FROM transactions");
  console.log(`atom transactions: ${count.rows[0]?.c}`);

  if (!APPLY) {
    console.log("Would backup DB, create flat table, migrate rows, drop atom tables.");
    return;
  }

  const archiveDir = path.resolve("archive/db");
  mkdirSync(archiveDir, { recursive: true });
  const backup = path.join(
    archiveDir,
    `jayrr-budget-atom-pre-flatten-${Date.now()}.db`,
  );
  copyFileSync(abs, backup);
  console.log(`backed up → ${backup}`);

  console.log("\n--- create lookup tables ---");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      section_id INTEGER REFERENCES transaction_sections(id) ON DELETE SET NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category_id INTEGER REFERENCES transaction_categories(id) ON DELETE SET NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_kinds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  console.log("--- build flat rows in memory ---");
  const source = await db.execute(`
    SELECT
      t.id,
      t.transaction_id AS fingerprint,
      t.account_id,
      t.description,
      t.pending,
      t.source,
      t.updated_at,
      a.name AS account_name,
      td.posted_date,
      td.authorized_date,
      ta.amount_minor,
      ta.currency_code,
      te.merchant_clean,
      te.merchant_raw,
      te.channel,
      te.enrichment_status,
      tbc.category_primary,
      tbc.category_detailed,
      tbc.category_confidence,
      loc.city,
      loc.region,
      loc.country,
      pref.transaction_code,
      pref.payment_channel
    FROM transactions t
    LEFT JOIN accounts a ON a.account_id = t.account_id
    LEFT JOIN transaction_dates td ON td.transaction_id = t.id
    LEFT JOIN transaction_amounts ta ON ta.transaction_id = t.id
    LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
    LEFT JOIN transaction_bank_categories tbc ON tbc.transaction_id = t.id
    LEFT JOIN transaction_locations loc ON loc.transaction_id = t.id
    LEFT JOIN transaction_payment_refs pref ON pref.transaction_id = t.id
    ORDER BY t.id
  `);

  const labels = await db.execute(`
    SELECT tl.transaction_id, tl.role, tn.name
    FROM transaction_labels tl
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE tl.role IN ('section', 'category', 'type', 'tag')
  `);
  const labelMap = new Map<number, { section?: string; category?: string; kind?: string; tags: string[] }>();
  for (const row of labels.rows) {
    const tid = Number(row.transaction_id);
    const entry = labelMap.get(tid) ?? { tags: [] };
    const name = String(row.name ?? "");
    if (row.role === "section") entry.section = name;
    else if (row.role === "category") entry.category = name;
    else if (row.role === "type") entry.kind = name;
    else if (row.role === "tag" && name) entry.tags.push(name);
    labelMap.set(tid, entry);
  }

  const entities = await db.execute(`
    SELECT te.transaction_id, te.role, e.display_name, e.website, e.logo_url
    FROM transaction_entities te
    JOIN entities e ON e.id = te.entity_id
    WHERE te.role IN ('company', 'brand')
  `);
  const entityMap = new Map<
    number,
    { company?: string; brand?: string; website?: string; logoUrl?: string }
  >();
  for (const row of entities.rows) {
    const tid = Number(row.transaction_id);
    const entry = entityMap.get(tid) ?? {};
    if (row.role === "company") {
      entry.company = String(row.display_name ?? "");
      if (row.website) entry.website = String(row.website);
      if (row.logo_url) entry.logoUrl = String(row.logo_url);
    } else if (row.role === "brand") {
      entry.brand = String(row.display_name ?? "");
    }
    entityMap.set(tid, entry);
  }

  const sectionCache = new Map<string, number>();
  const categoryCache = new Map<string, number>();
  const typeCache = new Map<string, number>();
  const kindCache = new Map<string, number>();

  type FlatArgs = InArgs;
  const insertArgs: FlatArgs[] = [];

  for (const row of source.rows) {
    const id = Number(row.id);
    const labs = labelMap.get(id) ?? { tags: [] };
    const ents = entityMap.get(id) ?? {};
    const section = labs.section ?? null;
    const category = labs.category ?? null;
    const kind = labs.kind ?? null;
    const txnType = inferTxnType(section);
    const amount = money(row.amount_minor);
    const debit = amount > 0 ? amount : null;
    const credit = amount < 0 ? Math.abs(amount) : null;
    const bankDirection = amount > 0 ? "debit" : amount < 0 ? "credit" : null;
    const tags =
      labs.tags.length > 0
        ? [...new Set(labs.tags)].sort((a, b) => a.localeCompare(b)).join(", ")
        : null;

    const sectionId = section
      ? await ensureLookup(db, "transaction_sections", section, sectionCache)
      : null;
    const categoryId = category
      ? await ensureLookup(db, "transaction_categories", category, categoryCache)
      : null;
    if (categoryId != null && sectionId != null) {
      await db.execute({
        sql: `UPDATE transaction_categories SET section_id = COALESCE(section_id, ?) WHERE id = ?`,
        args: [sectionId, categoryId],
      });
    }
    const transactionTypeId = txnType
      ? await ensureLookup(db, "transaction_types", txnType, typeCache)
      : null;
    const kindId = kind
      ? await ensureLookup(db, "transaction_kinds", kind, kindCache)
      : null;

    insertArgs.push([
      String(row.fingerprint),
      String(row.posted_date ?? "1970-01-01"),
      row.authorized_date == null ? null : String(row.authorized_date),
      row.account_name == null ? null : String(row.account_name),
      String(row.account_id),
      String(row.description ?? ""),
      null,
      row.merchant_clean == null ? null : String(row.merchant_clean),
      row.merchant_raw == null ? null : String(row.merchant_raw),
      ents.company ?? null,
      ents.brand ?? null,
      section,
      category,
      null,
      txnType,
      kind,
      sectionId,
      categoryId,
      null,
      transactionTypeId,
      kindId,
      row.category_primary == null ? null : String(row.category_primary),
      row.category_detailed == null ? null : String(row.category_detailed),
      row.category_confidence == null ? null : String(row.category_confidence),
      tags,
      row.channel == null
        ? row.payment_channel == null
          ? null
          : String(row.payment_channel)
        : String(row.channel),
      row.transaction_code == null ? null : String(row.transaction_code),
      bankDirection,
      null,
      row.enrichment_status == null ? null : String(row.enrichment_status),
      row.source == null ? null : String(row.source),
      Number(row.pending ?? 0) ? 1 : 0,
      row.city == null ? null : String(row.city),
      row.region == null ? null : String(row.region),
      row.country == null ? null : String(row.country),
      ents.website ?? null,
      ents.logoUrl ?? null,
      String(row.currency_code ?? "CAD"),
      debit,
      credit,
      amount,
      Number(row.updated_at ?? Date.now()),
    ]);
  }

  console.log(`prepared ${insertArgs.length} flat rows`);

  console.log("--- swap transactions table ---");
  await db.execute(`ALTER TABLE transactions RENAME TO transactions_atom_legacy`);
  await db.execute(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT NOT NULL UNIQUE,
      posted TEXT NOT NULL,
      authorized TEXT,
      account TEXT,
      account_id TEXT NOT NULL,
      description TEXT NOT NULL,
      original_description TEXT,
      merchant_clean TEXT,
      merchant_name TEXT,
      company TEXT,
      brand TEXT,
      section TEXT,
      category TEXT,
      subcategory TEXT,
      transaction_type TEXT,
      kind TEXT,
      section_id INTEGER REFERENCES transaction_sections(id) ON DELETE SET NULL,
      category_id INTEGER REFERENCES transaction_categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES transaction_subcategories(id) ON DELETE SET NULL,
      transaction_type_id INTEGER REFERENCES transaction_types(id) ON DELETE SET NULL,
      kind_id INTEGER REFERENCES transaction_kinds(id) ON DELETE SET NULL,
      category_primary TEXT,
      category_detailed TEXT,
      category_confidence TEXT,
      tags TEXT,
      channel TEXT,
      txn_code TEXT,
      bank_direction TEXT,
      cross_check TEXT,
      enrichment TEXT,
      source TEXT,
      pending INTEGER NOT NULL DEFAULT 0,
      city TEXT,
      region TEXT,
      country TEXT,
      website TEXT,
      logo_url TEXT,
      currency TEXT NOT NULL DEFAULT 'CAD',
      debit REAL,
      credit REAL,
      amount REAL NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS transactions_transaction_id_uidx ON transactions(transaction_id)`,
  );

  const INSERT_SQL = `INSERT INTO transactions (
    transaction_id, posted, authorized, account, account_id, description,
    original_description, merchant_clean, merchant_name, company, brand,
    section, category, subcategory, transaction_type, kind,
    section_id, category_id, subcategory_id, transaction_type_id, kind_id,
    category_primary, category_detailed, category_confidence, tags, channel,
    txn_code, bank_direction, cross_check, enrichment, source, pending,
    city, region, country, website, logo_url, currency, debit, credit, amount, updated_at
  ) VALUES (
    ?,?,?,?,?,?,
    ?,?,?,?,?,
    ?,?,?,?,?,
    ?,?,?,?,?,
    ?,?,?,?,?,
    ?,?,?,?,?,?,
    ?,?,?,?,?,?,?,?,?,?
  )`;

  const BATCH = 40;
  for (let i = 0; i < insertArgs.length; i += BATCH) {
    const chunk = insertArgs.slice(i, i + BATCH);
    await db.batch(chunk.map((args) => ({ sql: INSERT_SQL, args })));
    if (i === 0 || i + BATCH >= insertArgs.length || (i / BATCH) % 3 === 0) {
      console.log(`  inserted ${Math.min(i + BATCH, insertArgs.length)} / ${insertArgs.length}`);
    }
  }

  console.log("--- drop atom tables ---");
  for (const table of [...DROP_ATOM, "transactions_atom_legacy"]) {
    await db.execute(`DROP TABLE IF EXISTS ${table}`);
    console.log(`  dropped ${table}`);
  }

  const verify = await db.execute({
    sql: `select "id", "transaction_id", "posted", "authorized", "account", "account_id", "description", "original_description", "merchant_clean", "merchant_name", "company", "brand", "section", "category", "subcategory", "transaction_type", "kind", "section_id", "category_id", "subcategory_id", "transaction_type_id", "kind_id", "category_primary", "category_detailed", "category_confidence", "tags", "channel", "txn_code", "bank_direction", "cross_check", "enrichment", "source", "pending", "city", "region", "country", "website", "logo_url", "currency", "debit", "credit", "amount", "updated_at" from "transactions" order by "transactions"."posted" desc, "transactions"."id" desc limit ?`,
    args: [250],
  });
  console.log(`verify select rows: ${verify.rows.length}`);
  console.log("done");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
