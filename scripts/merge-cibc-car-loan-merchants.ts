/**
 * Merge CIBC car-loan PADs → merchant_clean = "CIBC Car Loan"
 * Leaves other CIBC spend untouched.
 *
 * Usage: npx tsx scripts/merge-cibc-car-loan-merchants.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";
import { CIBC_CAR_LOAN_MERCHANT } from "../src/domains/loans/domain/carLoanConstants";

const APPLY = process.argv.includes("--run");
const MATCH_AMOUNT = 294.8;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) {
    throw new Error(`Need Turso libsql:// URL, got ${url}`);
  }
  console.log("DATABASE_URL:", url.replace(/^(libsql:\/\/[^/]+).*/, "$1/…"));
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const db = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const where = `
    ABS(ABS(amount) - ?) < 0.02
    AND (
      lower(coalesce(merchant_clean, '')) IN ('cibc loans', 'cibc car loan')
      OR lower(coalesce(description, '')) LIKE '%preauthorized debit loan%'
      OR lower(coalesce(description, '')) LIKE '%pre-authorized debit%loan%'
      OR (
        lower(coalesce(description, '')) LIKE '%loan%'
        AND lower(coalesce(description, '')) LIKE '%cibc%'
      )
    )
  `;

  const before = await db.execute({
    sql: `
      SELECT merchant_clean, COUNT(*) AS c, ROUND(SUM(ABS(amount)), 2) AS total
      FROM transactions
      WHERE ${where}
      GROUP BY 1
      ORDER BY c DESC
    `,
    args: [MATCH_AMOUNT],
  });
  console.log("before:", before.rows);

  if (APPLY) {
    const upd = await db.execute({
      sql: `
        UPDATE transactions
        SET merchant_clean = ?,
            category_detailed = COALESCE(category_detailed, 'Personal Financing'),
            category_primary = COALESCE(category_primary, 'LOAN_PAYMENTS'),
            section = COALESCE(section, 'Finance'),
            category = COALESCE(category, 'Debt & Loans'),
            subcategory = COALESCE(subcategory, 'Personal Financing'),
            updated_at = ?
        WHERE ${where}
      `,
      args: [CIBC_CAR_LOAN_MERCHANT, Date.now(), MATCH_AMOUNT],
    });
    console.log("updated rows:", upd.rowsAffected);
  }

  const after = await db.execute({
    sql: `
      SELECT merchant_clean, COUNT(*) AS c
      FROM transactions
      WHERE ABS(ABS(amount) - ?) < 0.02
        AND lower(coalesce(merchant_clean, '')) = lower(?)
      GROUP BY 1
    `,
    args: [MATCH_AMOUNT, CIBC_CAR_LOAN_MERCHANT],
  });
  console.log("after (CIBC Car Loan @ 294.80):", after.rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
