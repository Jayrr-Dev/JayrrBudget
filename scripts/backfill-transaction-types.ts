/**
 * Backfill transaction_labels.role = "transaction_type" on Turso.
 * Agent context: AGENTS.md § transaction_type facet; rule .cursor/rules/turso-database.mdc
 *
 *   npx tsx scripts/backfill-transaction-types.ts
 *   npx tsx scripts/check-transaction-types.ts        # verify counts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { backfillTransactionTypes } from "../src/domains/enrichment/application/backfillTransactionTypes";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL missing — load .env.local (Turso) before running this script.",
    );
  }
  if (url.startsWith("file:")) {
    throw new Error(
      "Refusing file: DATABASE_URL — use Turso credentials in .env.local.",
    );
  }
  const target = url.replace(/(libsql:\/\/)[^/]+/, "$1***");
  console.log(`backfillTransactionTypes → ${target}`);

  const result = await backfillTransactionTypes();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
