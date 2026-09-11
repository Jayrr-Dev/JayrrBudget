/**
 * Full category hygiene against Turso.
 * Prefer a small set-based SQL script for one-off label fixes — this walks all txns.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { runCategoryHygienePipeline } from "../src/domains/statements/application/runCategoryHygienePipeline";
import { getDb } from "../src/shared/db";
import { sql } from "drizzle-orm";

async function counts() {
  const db = getDb();
  return db.get(sql`
    select
      (select count(*) from transactions) as transactions,
      (select count(*) from transaction_labels tl
        join taxonomy_nodes tn on tn.id = tl.node_id
        where tl.role = 'transaction_type') as transaction_type_labels,
      (select count(*) from transaction_labels tl
        join taxonomy_nodes tn on tn.id = tl.node_id
        where tl.role = 'category' and tn.name = 'Shopping') as shopping
  `);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL missing — set Turso credentials in .env.local");
  }

  console.log("target", process.env.DATABASE_URL.replace(/(libsql:\/\/)[^/]+/, "$1***"));
  console.log("before", await counts());

  const hygiene = await runCategoryHygienePipeline({ skipAi: true });
  console.log("hygiene", JSON.stringify(hygiene, null, 2));

  for (const warning of hygiene.warnings) {
    console.warn("warning", warning);
  }

  console.log("after", await counts());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
