import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const proto = url.split(":")[0];
console.log("protocol", proto);
console.log("isTurso", proto === "libsql" || url.includes("turso.io"));
console.log("isFile", proto === "file" || url.includes(".db"));

const db = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function main() {
const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
);
console.log("tables", tables.rows.map((r) => r.name).join(","));

const info = await db.execute("PRAGMA table_info(transactions)");
console.log(
  "columns",
  info.rows.map((r) => String(r.name)).join(","),
);

try {
  const cnt = await db.execute("SELECT COUNT(*) AS c FROM transactions");
  console.log("count", cnt.rows[0]?.c);
} catch (err) {
  console.error("count failed", err instanceof Error ? err.message : err);
}

const expected = [
  "id",
  "transaction_id",
  "posted",
  "authorized",
  "account",
  "account_id",
  "description",
  "original_description",
  "merchant_clean",
  "merchant_name",
  "company",
  "brand",
  "section",
  "category",
  "subcategory",
  "transaction_type",
  "kind",
  "section_id",
  "category_id",
  "subcategory_id",
  "transaction_type_id",
  "kind_id",
  "category_primary",
  "category_detailed",
  "category_confidence",
  "tags",
  "channel",
  "txn_code",
  "bank_direction",
  "cross_check",
  "enrichment",
  "source",
  "pending",
  "city",
  "region",
  "country",
  "website",
  "logo_url",
  "currency",
  "debit",
  "credit",
  "amount",
  "updated_at",
];
const actual = new Set(info.rows.map((r) => String(r.name)));
console.log(
  "missing",
  expected.filter((c) => !actual.has(c)).join(",") || "(none)",
);
console.log(
  "extra",
  [...actual].filter((c) => !expected.includes(c)).join(",") || "(none)",
);

  try {
    await db.execute(
      `select "id", "transaction_id", "posted", "authorized", "account", "account_id", "description", "original_description", "merchant_clean", "merchant_name", "company", "brand", "section", "category", "subcategory", "transaction_type", "kind", "section_id", "category_id", "subcategory_id", "transaction_type_id", "kind_id", "category_primary", "category_detailed", "category_confidence", "tags", "channel", "txn_code", "bank_direction", "cross_check", "enrichment", "source", "pending", "city", "region", "country", "website", "logo_url", "currency", "debit", "credit", "amount", "updated_at" from "transactions" order by "transactions"."posted" desc, "transactions"."id" desc limit ?`,
      { args: [250] },
    );
    console.log("select ok");
  } catch (err) {
    console.error("select failed", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
