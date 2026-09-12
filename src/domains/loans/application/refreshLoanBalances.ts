import {
  toMatchedPads,
  type PadCandidateRow,
} from "@/domains/loans/application/matchLoanPayments";
import {
  amortizeLoan,
  buildScheduledDates,
  matchPadsToSchedule,
  type AmortizeResult,
  type LoanPaymentStep,
} from "@/domains/loans/domain/amortize";
import {
  CIBC_CAR_LOAN_ACCOUNT_ID,
  CIBC_CAR_LOAN_MERCHANT,
  CIBC_CAR_LOAN_TERMS,
} from "@/domains/loans/domain/carLoanConstants";
import { getDb, getLibsqlClient } from "@/shared/db";
import { invalidateTursoReadCache } from "@/shared/db/readCache";
import { accounts, loanTerms } from "@/shared/db/schema";
import { eq } from "drizzle-orm";

export type LoanTermsRow = {
  accountId: string;
  principalStart: number;
  annualRate: number;
  aprDisclosed: number | null;
  paymentAmount: number;
  paymentFrequency: string;
  paymentCount: number;
  firstPaymentDate: string;
  maturityDate: string;
  matchMerchantClean: string;
  matchAmount: number;
  principalOverride: number | null;
  overrideAsOf: string | null;
  vehicleLabel: string | null;
};

export type LoanDashboardSummary = {
  remainingPrincipal: number;
  nextPaymentDate: string | null;
  progressPct: number;
  annualRate: number;
  aprDisclosed: number | null;
  paymentAmount: number;
  paymentCount: number;
  paymentsApplied: number;
  remainingPayments: number;
  firstPaymentDate: string;
  maturityDate: string;
  vehicleLabel: string | null;
  paidInterest: number;
  paidPrincipal: number;
  matchMerchantClean: string;
  payments: LoanPaymentStep[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function summaryFromAmortize(
  terms: LoanTermsRow,
  result: AmortizeResult,
): LoanDashboardSummary {
  return {
    remainingPrincipal: result.currentBalance,
    nextPaymentDate: result.nextPaymentDate,
    progressPct: result.progressPct,
    annualRate: terms.annualRate,
    aprDisclosed: terms.aprDisclosed,
    paymentAmount: terms.paymentAmount,
    paymentCount: terms.paymentCount,
    paymentsApplied: result.paymentsApplied,
    remainingPayments: result.remainingPayments,
    firstPaymentDate: terms.firstPaymentDate,
    maturityDate: terms.maturityDate,
    vehicleLabel: terms.vehicleLabel,
    paidInterest: result.paidInterest,
    paidPrincipal: result.paidPrincipal,
    matchMerchantClean: terms.matchMerchantClean,
    payments: result.schedule.filter((s) => s.applied),
  };
}

/** Prefetch PAD candidates for a loan (filtered query — not full ledger). */
export async function loadPadCandidates(
  matchAmount: number,
): Promise<PadCandidateRow[]> {
  const client = getLibsqlClient();
  const result = await client.execute({
    sql: `
      SELECT transaction_id, posted, amount, merchant_clean, description
      FROM transactions
      WHERE ABS(ABS(amount) - ?) < 0.02
        AND (
          lower(coalesce(merchant_clean, '')) IN ('cibc car loan', 'cibc loans')
          OR lower(coalesce(description, '')) LIKE '%preauthorized debit loan%'
          OR lower(coalesce(description, '')) LIKE '%pre-authorized debit%loan%'
          OR (
            lower(coalesce(description, '')) LIKE '%loan%'
            AND (
              lower(coalesce(description, '')) LIKE '%cibc%'
              OR lower(coalesce(merchant_clean, '')) LIKE '%cibc%'
            )
          )
        )
      ORDER BY posted ASC
    `,
    args: [matchAmount],
  });

  return result.rows.map((row) => ({
    transactionId: String(row.transaction_id),
    posted: String(row.posted),
    amount: Number(row.amount),
    merchantClean:
      row.merchant_clean == null ? null : String(row.merchant_clean),
    description: String(row.description ?? ""),
  }));
}

export async function loadAllLoanTerms(): Promise<LoanTermsRow[]> {
  const db = getDb();
  const rows = await db.select().from(loanTerms);
  return rows.map((row) => ({
    accountId: row.accountId,
    principalStart: row.principalStart,
    annualRate: row.annualRate,
    aprDisclosed: row.aprDisclosed,
    paymentAmount: row.paymentAmount,
    paymentFrequency: row.paymentFrequency,
    paymentCount: row.paymentCount,
    firstPaymentDate: row.firstPaymentDate,
    maturityDate: row.maturityDate,
    matchMerchantClean: row.matchMerchantClean,
    matchAmount: row.matchAmount,
    principalOverride: row.principalOverride,
    overrideAsOf: row.overrideAsOf,
    vehicleLabel: row.vehicleLabel,
  }));
}

export function computeLoanAmortization(
  terms: LoanTermsRow,
  pads: PadCandidateRow[],
  asOfDate = todayIso(),
): AmortizeResult {
  const matchedPads = toMatchedPads(pads);
  const scheduledDates = buildScheduledDates(
    terms.firstPaymentDate,
    terms.paymentCount,
  );
  const matchedByNumber = matchPadsToSchedule(
    scheduledDates,
    matchedPads,
    terms.matchAmount,
  );

  return amortizeLoan(
    {
      principalStart: terms.principalStart,
      annualRate: terms.annualRate,
      paymentAmount: terms.paymentAmount,
      paymentCount: terms.paymentCount,
      firstPaymentDate: terms.firstPaymentDate,
      principalOverride: terms.principalOverride,
      overrideAsOf: terms.overrideAsOf,
    },
    asOfDate,
    matchedByNumber,
  );
}

/**
 * Recompute amortization, write balance + payment links (Turso batch).
 */
export async function refreshLoanAccount(
  terms: LoanTermsRow,
  options?: { asOfDate?: string; pads?: PadCandidateRow[] },
): Promise<{ result: AmortizeResult; linkedPads: number }> {
  const asOfDate = options?.asOfDate ?? todayIso();
  const pads = options?.pads ?? (await loadPadCandidates(terms.matchAmount));
  const result = computeLoanAmortization(terms, pads, asOfDate);
  const client = getLibsqlClient();
  const now = Date.now();

  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `UPDATE accounts SET current_balance = ?, available_balance = ?, updated_at = ? WHERE account_id = ?`,
      args: [
        result.currentBalance,
        result.currentBalance,
        now,
        terms.accountId,
      ],
    },
    {
      sql: `DELETE FROM loan_payment_links WHERE loan_account_id = ?`,
      args: [terms.accountId],
    },
  ];

  for (const step of result.schedule) {
    if (!step.applied) continue;
    stmts.push({
      sql: `INSERT INTO loan_payment_links (
        loan_account_id, payment_number, scheduled_date, posted_date,
        transaction_id, payment_amount, interest_portion, principal_portion, balance_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        terms.accountId,
        step.paymentNumber,
        step.scheduledDate,
        step.postedDate,
        step.transactionId,
        step.paymentAmount,
        step.interestPortion,
        step.principalPortion,
        step.balanceAfter,
      ],
    });
  }

  // libsql batch chunks to stay under payload limits
  const CHUNK = 80;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await client.batch(stmts.slice(i, i + CHUNK), "write");
  }

  invalidateTursoReadCache("dashboard:");

  const linkedPads = result.schedule.filter(
    (s) => s.applied && s.transactionId,
  ).length;

  return { result, linkedPads };
}

export async function refreshAllLoans(asOfDate?: string) {
  const termsList = await loadAllLoanTerms();
  if (termsList.length === 0) return [];

  const pads = await loadPadCandidates(
    termsList[0]?.matchAmount ?? CIBC_CAR_LOAN_TERMS.matchAmount,
  );

  const out: {
    accountId: string;
    balance: number;
    paymentsApplied: number;
    linkedPads: number;
  }[] = [];

  for (const terms of termsList) {
    const { result, linkedPads } = await refreshLoanAccount(terms, {
      asOfDate,
      pads,
    });
    out.push({
      accountId: terms.accountId,
      balance: result.currentBalance,
      paymentsApplied: result.paymentsApplied,
      linkedPads,
    });
  }

  return out;
}

export async function ensureCarLoanSchema() {
  const client = getLibsqlClient();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS loan_terms (
      account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
      principal_start REAL NOT NULL,
      annual_rate REAL NOT NULL,
      apr_disclosed REAL,
      payment_amount REAL NOT NULL,
      payment_frequency TEXT NOT NULL DEFAULT 'biweekly',
      payment_count INTEGER NOT NULL,
      first_payment_date TEXT NOT NULL,
      maturity_date TEXT NOT NULL,
      match_merchant_clean TEXT NOT NULL,
      match_amount REAL NOT NULL,
      principal_override REAL,
      override_as_of TEXT,
      vehicle_label TEXT,
      updated_at INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS loan_payment_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      payment_number INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      posted_date TEXT,
      transaction_id TEXT,
      payment_amount REAL NOT NULL,
      interest_portion REAL NOT NULL,
      principal_portion REAL NOT NULL,
      balance_after REAL NOT NULL,
      UNIQUE (loan_account_id, payment_number)
    )
  `);
}

export async function seedCibcCarLoanAccount(institutionId: string) {
  const db = getDb();
  const now = new Date();
  const t = CIBC_CAR_LOAN_TERMS;

  const existing = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(eq(accounts.accountId, CIBC_CAR_LOAN_ACCOUNT_ID))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(accounts).values({
      accountId: CIBC_CAR_LOAN_ACCOUNT_ID,
      institutionId,
      name: t.accountName,
      officialName: t.officialName,
      mask: null,
      type: "loan",
      subtype: t.subtype,
      currentBalance: t.principalStart,
      availableBalance: t.principalStart,
      isoCurrencyCode: "CAD",
      updatedAt: now,
    });
  } else {
    await db
      .update(accounts)
      .set({
        name: t.accountName,
        officialName: t.officialName,
        type: "loan",
        subtype: t.subtype,
        updatedAt: now,
      })
      .where(eq(accounts.accountId, CIBC_CAR_LOAN_ACCOUNT_ID));
  }

  await db
    .insert(loanTerms)
    .values({
      accountId: CIBC_CAR_LOAN_ACCOUNT_ID,
      principalStart: t.principalStart,
      annualRate: t.annualRate,
      aprDisclosed: t.aprDisclosed,
      paymentAmount: t.paymentAmount,
      paymentFrequency: t.paymentFrequency,
      paymentCount: t.paymentCount,
      firstPaymentDate: t.firstPaymentDate,
      maturityDate: t.maturityDate,
      matchMerchantClean: CIBC_CAR_LOAN_MERCHANT,
      matchAmount: t.matchAmount,
      principalOverride: null,
      overrideAsOf: null,
      vehicleLabel: t.vehicleLabel,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: loanTerms.accountId,
      set: {
        principalStart: t.principalStart,
        annualRate: t.annualRate,
        aprDisclosed: t.aprDisclosed,
        paymentAmount: t.paymentAmount,
        paymentFrequency: t.paymentFrequency,
        paymentCount: t.paymentCount,
        firstPaymentDate: t.firstPaymentDate,
        maturityDate: t.maturityDate,
        matchMerchantClean: CIBC_CAR_LOAN_MERCHANT,
        matchAmount: t.matchAmount,
        vehicleLabel: t.vehicleLabel,
        updatedAt: now,
      },
    });
}

export {
  CIBC_CAR_LOAN_ACCOUNT_ID,
  CIBC_CAR_LOAN_MERCHANT,
  CIBC_CAR_LOAN_TERMS,
};
