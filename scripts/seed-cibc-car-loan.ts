/**
 * Ensure loan_terms schema, seed CIBC Car Loan account, refresh amortization.
 *
 * Usage: npx tsx scripts/seed-cibc-car-loan.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  ensureCarLoanSchema,
  refreshLoanAccount,
  seedCibcCarLoanAccount,
  loadAllLoanTerms,
  CIBC_CAR_LOAN_ACCOUNT_ID,
  CIBC_CAR_LOAN_TERMS,
} from "../src/domains/loans/application/refreshLoanBalances";
import { getDb, getLibsqlClient } from "../src/shared/db";
import { institutions, accounts } from "../src/shared/db/schema";
import { eq } from "drizzle-orm";

const APPLY = process.argv.includes("--run");

async function resolveCibcInstitutionId(): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      institutionId: institutions.institutionId,
      name: institutions.name,
    })
    .from(institutions);

  const hit =
    rows.find((r) => (r.name ?? "").toLowerCase().includes("cibc")) ??
    rows.find((r) => r.institutionId.toLowerCase().includes("cibc"));

  if (hit) return hit.institutionId;

  if (!APPLY) {
    console.log("No CIBC institution found (dry-run); would create cibc");
    return "cibc";
  }

  const client = getLibsqlClient();
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO institutions (institution_id, name, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(institution_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
    args: ["cibc", "CIBC", now, now],
  });
  return "cibc";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) {
    throw new Error(`Need Turso libsql:// URL, got ${url}`);
  }
  console.log("DATABASE_URL:", url.replace(/^(libsql:\/\/[^/]+).*/, "$1/…"));
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  await ensureCarLoanSchema();
  console.log("schema: loan_terms + loan_payment_links ready");

  const institutionId = await resolveCibcInstitutionId();
  console.log("institution:", institutionId);
  console.log("terms:", {
    accountId: CIBC_CAR_LOAN_ACCOUNT_ID,
    principalStart: CIBC_CAR_LOAN_TERMS.principalStart,
    rate: CIBC_CAR_LOAN_TERMS.annualRate,
    payment: CIBC_CAR_LOAN_TERMS.paymentAmount,
    count: CIBC_CAR_LOAN_TERMS.paymentCount,
    first: CIBC_CAR_LOAN_TERMS.firstPaymentDate,
    maturity: CIBC_CAR_LOAN_TERMS.maturityDate,
  });

  if (!APPLY) {
    console.log("Dry-run only. Pass --run to seed + refresh.");
    return;
  }

  await seedCibcCarLoanAccount(institutionId);

  const db = getDb();
  const before = await db
    .select({
      currentBalance: accounts.currentBalance,
    })
    .from(accounts)
    .where(eq(accounts.accountId, CIBC_CAR_LOAN_ACCOUNT_ID))
    .limit(1);
  console.log("balance before refresh:", before[0]?.currentBalance);

  const termsList = await loadAllLoanTerms();
  const terms = termsList.find((t) => t.accountId === CIBC_CAR_LOAN_ACCOUNT_ID);
  if (!terms) throw new Error("loan_terms missing after seed");

  const { result, linkedPads } = await refreshLoanAccount(terms);
  console.log("balance after refresh:", result.currentBalance);
  console.log("payments applied:", result.paymentsApplied);
  console.log("remaining payments:", result.remainingPayments);
  console.log("linked PAD txns:", linkedPads);
  console.log("paid interest:", result.paidInterest);
  console.log("paid principal:", result.paidPrincipal);
  console.log("next payment:", result.nextPaymentDate);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
