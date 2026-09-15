/**
 * Drop atom/taxonomy schema. Rebuild flat transactions from CSV.
 *
 * Usage:
 *   npx tsx scripts/rebuild-flat-transactions.ts --run
 *   npx tsx scripts/rebuild-flat-transactions.ts --run --csv "C:/path/to/transactions.csv"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type Client } from "@libsql/client";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import path from "node:path";
import {
  classifySpread,
  SPREAD_DEFINITIONS,
} from "../src/domains/transactions/domain/spreads";

const APPLY = process.argv.includes("--run");
const csvArgIdx = process.argv.indexOf("--csv");
const CSV_PATH =
  csvArgIdx >= 0
    ? process.argv[csvArgIdx + 1]
    : String.raw`c:\Users\Work\Documents\1-TASK\Budget Cat Clean up\transactions.csv`;

const DROP_TABLES = [
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
  "transactions",
  "transaction_sections",
  "transaction_spreads",
  "transaction_categories",
  "transaction_subcategories",
  "transaction_types",
  "transaction_kinds",
];

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function parseMoney(v: string | undefined): number | null {
  const t = emptyToNull(v);
  if (t == null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseBool(v: string | undefined): boolean {
  const t = (v ?? "").trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

async function ensureLookup(
  db: Client,
  table: string,
  name: string,
  cache: Map<string, number>,
): Promise<number | null> {
  const key = name.trim();
  if (!key) return null;
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
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) {
    throw new Error(`Refusing non-Turso URL: ${url}`);
  }
  console.log(`DB: ${url.slice(0, 48)}…`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run (pass --run)");

  const db = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  if (!APPLY) {
    console.log("Would drop:", DROP_TABLES.join(", "));
    console.log("Would recreate flat schema + import CSV.");
    return;
  }

  console.log("\n--- drop old tables ---");
  for (const table of DROP_TABLES) {
    await db.execute(`DROP TABLE IF EXISTS ${table}`);
    console.log(`  dropped ${table}`);
  }

  console.log("\n--- create flat schema ---");
  await db.execute(`
    CREATE TABLE transaction_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  await db.execute(`
    CREATE TABLE transaction_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      section_id INTEGER REFERENCES transaction_sections(id) ON DELETE SET NULL
    )
  `);
  await db.execute(`
    CREATE TABLE transaction_subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category_id INTEGER REFERENCES transaction_categories(id) ON DELETE SET NULL
    )
  `);
  await db.execute(`
    CREATE TABLE transaction_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  await db.execute(`
    CREATE TABLE transaction_kinds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  await db.execute(`
    CREATE TABLE transaction_spreads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      target_percent INTEGER NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
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
      spread TEXT,
      transaction_type TEXT,
      kind TEXT,
      section_id INTEGER REFERENCES transaction_sections(id) ON DELETE SET NULL,
      category_id INTEGER REFERENCES transaction_categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES transaction_subcategories(id) ON DELETE SET NULL,
      spread_id INTEGER REFERENCES transaction_spreads(id) ON DELETE SET NULL,
      transaction_type_id INTEGER REFERENCES transaction_types(id) ON DELETE SET NULL,
      kind_id INTEGER REFERENCES transaction_kinds(id) ON DELETE SET NULL,
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

  for (const def of SPREAD_DEFINITIONS) {
    await db.execute({
      sql: `INSERT INTO transaction_spreads (name, target_percent, description, sort_order)
            VALUES (?, ?, ?, ?)`,
      args: [def.name, def.targetPercent, def.description, def.sortOrder],
    });
  }
  console.log("  created lookup + transactions + seeded spreads");

  const sectionCache = new Map<string, number>();
  const categoryCache = new Map<string, number>();
  const subCache = new Map<string, number>();
  const typeCache = new Map<string, number>();
  const kindCache = new Map<string, number>();
  const spreadCache = new Map<string, number>();
  for (const def of SPREAD_DEFINITIONS) {
    const row = await db.execute({
      sql: `SELECT id FROM transaction_spreads WHERE name = ? LIMIT 1`,
      args: [def.name],
    });
    spreadCache.set(def.name.toLowerCase(), Number(row.rows[0]!.id));
  }
  const accountNames = new Map<string, string>();

  console.log("\n--- import CSV ---");
  const rows: Record<string, string>[] = [];
  await new Promise<void>((resolve, reject) => {
    createReadStream(CSV_PATH)
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          bom: true,
        }),
      )
      .on("data", (row: Record<string, string>) => rows.push(row))
      .on("error", reject)
      .on("end", () => resolve());
  });
  console.log(`  parsed ${rows.length} rows`);

  let inserted = 0;
  const now = Date.now();
  const BATCH = 40;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const stmts = [];

    for (const row of chunk) {
      const section = emptyToNull(row.Section);
      const category = emptyToNull(row.Category);
      const subcategory = emptyToNull(row.Subcategories);
      const txnType = emptyToNull(row["Transaction type"]);
      const kind = emptyToNull(row.Type);
      const accountId = emptyToNull(row.accountId) ?? "unknown";
      const accountName = emptyToNull(row.Account);
      if (accountName) accountNames.set(accountId, accountName);

      const sectionId = section
        ? await ensureLookup(db, "transaction_sections", section, sectionCache)
        : null;
      const categoryId = category
        ? await ensureLookup(
            db,
            "transaction_categories",
            category,
            categoryCache,
          )
        : null;
      if (categoryId != null && sectionId != null) {
        await db.execute({
          sql: `UPDATE transaction_categories SET section_id = COALESCE(section_id, ?) WHERE id = ?`,
          args: [sectionId, categoryId],
        });
      }
      const subcategoryId = subcategory
        ? await ensureLookup(
            db,
            "transaction_subcategories",
            subcategory,
            subCache,
          )
        : null;
      if (subcategoryId != null && categoryId != null) {
        await db.execute({
          sql: `UPDATE transaction_subcategories SET category_id = COALESCE(category_id, ?) WHERE id = ?`,
          args: [categoryId, subcategoryId],
        });
      }
      const transactionTypeId = txnType
        ? await ensureLookup(db, "transaction_types", txnType, typeCache)
        : null;
      const kindId = kind
        ? await ensureLookup(db, "transaction_kinds", kind, kindCache)
        : null;
      const spread = classifySpread({ section, category, subcategory });
      const spreadId = spread
        ? (spreadCache.get(spread.toLowerCase()) ?? null)
        : null;

      const amount =
        parseMoney(row.Amount) ??
        (parseMoney(row.Debit) != null
          ? parseMoney(row.Debit)!
          : parseMoney(row.Credit) != null
            ? -parseMoney(row.Credit)!
            : 0);

      const txnId =
        emptyToNull(row.transactionId) ??
        `import_${i}_${inserted}_${Math.random().toString(36).slice(2, 8)}`;

      stmts.push({
        sql: `INSERT INTO transactions (
          transaction_id, posted, authorized, account, account_id, description,
          original_description, merchant_clean, merchant_name, company, brand,
          section, category, subcategory, spread, transaction_type, kind,
          section_id, category_id, subcategory_id, spread_id, transaction_type_id, kind_id,
          tags, channel,
          txn_code, bank_direction, cross_check, enrichment, source, pending,
          city, region, country, website, logo_url, currency, debit, credit, amount, updated_at
        ) VALUES (
          ?,?,?,?,?,?,
          ?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?
        )`,
        args: [
          txnId,
          emptyToNull(row.Posted) ?? "1970-01-01",
          emptyToNull(row.Authorized),
          accountName,
          accountId,
          emptyToNull(row.Description) ?? "",
          emptyToNull(row["Original description"]),
          emptyToNull(row["Merchant clean"]),
          emptyToNull(row["Merchant name"]),
          emptyToNull(row.Company),
          emptyToNull(row.Brand),
          section,
          category,
          subcategory,
          spread,
          txnType,
          kind,
          sectionId,
          categoryId,
          subcategoryId,
          spreadId,
          transactionTypeId,
          kindId,
          emptyToNull(row.Tags),
          emptyToNull(row.Channel),
          emptyToNull(row["Txn code"]),
          emptyToNull(row["Bank direction"]),
          emptyToNull(row["Cross-check"]),
          emptyToNull(row.Enrichment),
          emptyToNull(row.Source),
          parseBool(row.Pending) ? 1 : 0,
          emptyToNull(row.City),
          emptyToNull(row.Region),
          emptyToNull(row.Country),
          emptyToNull(row.Website),
          emptyToNull(row["Logo URL"]),
          emptyToNull(row.CCY) ?? "CAD",
          parseMoney(row.Debit),
          parseMoney(row.Credit),
          amount,
          now,
        ],
      });
      inserted += 1;
    }

    await db.batch(stmts);
    if ((i / BATCH) % 5 === 0) {
      console.log(`  … ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
    }
  }

  // Ensure accounts exist for filters / accounts page
  console.log("\n--- sync accounts from CSV ---");
  let inst = await db.execute(
    `SELECT institution_id FROM institutions LIMIT 1`,
  );
  let institutionId = inst.rows[0]?.institution_id
    ? String(inst.rows[0].institution_id)
    : null;
  if (!institutionId) {
    await db.execute({
      sql: `INSERT INTO institutions (institution_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      args: ["manual-cibc", "CIBC", now, now],
    });
    institutionId = "manual-cibc";
  }
  for (const [accountId, name] of accountNames) {
    const exists = await db.execute({
      sql: `SELECT id FROM accounts WHERE account_id = ? LIMIT 1`,
      args: [accountId],
    });
    if (exists.rows[0]) continue;
    await db.execute({
      sql: `INSERT INTO accounts (account_id, institution_id, name, iso_currency_code, updated_at)
            VALUES (?, ?, ?, 'CAD', ?)`,
      args: [accountId, institutionId, name, now],
    });
    console.log(`  account ${accountId} → ${name}`);
  }

  const counts = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM transactions) AS transactions,
      (SELECT COUNT(*) FROM transaction_sections) AS sections,
      (SELECT COUNT(*) FROM transaction_categories) AS categories,
      (SELECT COUNT(*) FROM transaction_subcategories) AS subcategories,
      (SELECT COUNT(*) FROM transaction_types) AS types,
      (SELECT COUNT(*) FROM transaction_kinds) AS kinds
  `);
  console.log("\nDone:", counts.rows[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
