/**
 * Loan amortization helpers. Live refresh writes go through
 * `api.dashboard.refreshLoans` with the signed-in user's Convex JWT.
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
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

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

export async function refreshAllLoans(asOfDate?: string) {
  const client = await getAuthenticatedConvexClient();
  return client.mutation(api.dashboard.refreshLoans, { asOfDate });
}

export async function refreshLoanAccount() {
  throw new Error(
    "refreshLoanAccount is retired — use refreshAllLoans / api.dashboard.refreshLoans",
  );
}

export async function ensureCarLoanSchema() {}

export async function seedCibcCarLoanAccount() {
  throw new Error(
    "seedCibcCarLoanAccount is retired — seed loanTerms in Convex instead",
  );
}

export {
  CIBC_CAR_LOAN_ACCOUNT_ID,
  CIBC_CAR_LOAN_MERCHANT,
  CIBC_CAR_LOAN_TERMS,
};
