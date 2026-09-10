import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { enrichTransactionsByIds } from "../src/domains/enrichment/application/enrichTransactions";
import { runCategoryHygienePipeline } from "../src/domains/statements/application/runCategoryHygienePipeline";
import { getDb } from "../src/shared/db";
import { transactions } from "../src/shared/db/schema";

function dbClient() {
  return createClient({
    url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
    ...(process.env.DATABASE_AUTH_TOKEN
      ? { authToken: process.env.DATABASE_AUTH_TOKEN }
      : {}),
  });
}

async function counts() {
  const result = await dbClient().execute(`
    select
      (select count(*) from taxonomy_nodes) as taxonomy_nodes,
      (select count(*) from entities) as entities,
      (select count(*) from transaction_enrichment) as transaction_enrichment,
      (select count(*) from transaction_labels) as transaction_labels,
      (select count(*) from transactions) as transactions
  `);
  return result.rows[0];
}

async function main() {
  const db = getDb();
  await db.$client.execute("PRAGMA busy_timeout = 30000");

  console.log("before", await counts());

  const ids = (await db.select({ id: transactions.id }).from(transactions)).map(
    (row) => row.id,
  );
  console.log(`txns=${ids.length}`);

  console.log("hygiene start");
  const hygiene = await runCategoryHygienePipeline({ skipAi: true });
  console.log(
    `hygiene merges=${hygiene.consolidate.mergesApplied} rules=${hygiene.rules.matched} ai=${hygiene.aiClean.updated} warnings=${hygiene.warnings.length}`,
  );
  for (const warning of hygiene.warnings) {
    console.warn("hygiene warning", warning);
  }
  console.log("after hygiene", await counts());

  console.log("enrichment start");
  const enrichment = await enrichTransactionsByIds(ids);
  if (enrichment.ok) {
    console.log(
      `enrichment enriched=${enrichment.enriched} failed=${enrichment.failed}`,
    );
  } else {
    console.error(`enrichment FAIL ${enrichment.error}`);
    process.exitCode = 1;
  }

  console.log("after", await counts());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
