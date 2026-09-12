/**
 * Recompute all synthetic loan balances + payment links.
 *
 * Usage: npx tsx scripts/refresh-loan-balances.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  ensureCarLoanSchema,
  refreshAllLoans,
} from "../src/domains/loans/application/refreshLoanBalances";

const APPLY = process.argv.includes("--run");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) {
    throw new Error(`Need Turso libsql:// URL, got ${url}`);
  }
  console.log("DATABASE_URL:", url.replace(/^(libsql:\/\/[^/]+).*/, "$1/…"));
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  await ensureCarLoanSchema();

  if (!APPLY) {
    console.log("Dry-run only. Pass --run to refresh balances.");
    return;
  }

  const rows = await refreshAllLoans();
  if (rows.length === 0) {
    console.log("No loan_terms rows. Run seed-cibc-car-loan.ts --run first.");
    return;
  }
  for (const row of rows) {
    console.log(row);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
