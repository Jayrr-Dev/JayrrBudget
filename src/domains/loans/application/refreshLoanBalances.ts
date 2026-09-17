/**
 * Loan amortization helpers for the private ledger.
 * Live balances are computed in the browser via dashboardFromPrivateLedger.
 * Convex `refreshLoans` is retired for vault-only money storage.
 */
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
    payments: result.schedule.filter((step) => step.applied),
  };
}

export function computeLoanAmortization(
  terms: LoanTermsRow,
  pads: PadCandidateRow[],
  asOfDate = todayIso(),
): AmortizeResult {
  const matchedPads = toMatchedPads(
    pads,
    terms.matchAmount,
    terms.matchMerchantClean,
  );
  const scheduledDates = buildScheduledDates(
    terms.firstPaymentDate,
    terms.paymentCount,
    terms.paymentFrequency,
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
      paymentFrequency: terms.paymentFrequency,
      principalOverride: terms.principalOverride,
      overrideAsOf: terms.overrideAsOf,
    },
    asOfDate,
    matchedByNumber,
  );
}

export async function loadPadCandidates(): Promise<PadCandidateRow[]> {
  return [];
}

export async function loadAllLoanTerms(): Promise<LoanTermsRow[]> {
  return [];
}

/** @deprecated Vault amortizes in the browser. Convex refresh is retired. */
export async function refreshAllLoans(_asOfDate?: string) {
  throw new Error(
    "refreshAllLoans is retired. Private ledger amortizes loans in the browser (dashboardFromPrivateLedger).",
  );
}

export async function refreshLoanAccount() {
  throw new Error(
    "refreshLoanAccount is retired. Private ledger amortizes loans in the browser.",
  );
}

export async function ensureCarLoanSchema() {}

export async function seedCibcCarLoanAccount() {
  throw new Error(
    "seedCibcCarLoanAccount is retired. Register lending accounts in the vault.",
  );
}

export {
  CIBC_CAR_LOAN_ACCOUNT_ID,
  CIBC_CAR_LOAN_MERCHANT,
  CIBC_CAR_LOAN_TERMS,
};
