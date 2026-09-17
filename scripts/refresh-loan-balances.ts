/**
 * Recompute synthetic loan balances — retired for private ledger.
 * Vault amortizes in the browser via dashboardFromPrivateLedger.
 *
 * Usage: npx tsx scripts/refresh-loan-balances.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

console.log(
  "refresh-loan-balances is retired. Private ledger amortizes loans in the browser (dashboardFromPrivateLedger).",
);
process.exit(0);
