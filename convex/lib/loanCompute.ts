import {
  amortizeLoan,
  buildScheduledDates,
  matchPadsToSchedule,
  type AmortizeResult,
  type LoanPaymentStep,
} from "./amortize";
import {
  toMatchedPads,
  type PadCandidateRow,
} from "./matchLoanPayments";

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
  loanType: string;
  rateType: string;
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
  loanType: string;
  rateType: string;
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
    loanType: terms.loanType,
    rateType: terms.rateType,
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

export function collectPadCandidates(
  rows: Array<{
    transactionId: string;
    posted: string;
    amount: number;
    merchantClean: string | null;
    description: string;
  }>,
  matchAmount: number,
): PadCandidateRow[] {
  return rows
    .filter((row) => Math.abs(Math.abs(row.amount) - matchAmount) < 0.02)
    .map((row) => ({
      transactionId: row.transactionId,
      posted: row.posted,
      amount: row.amount,
      merchantClean: row.merchantClean,
      description: row.description,
    }))
    .sort((a, b) => a.posted.localeCompare(b.posted));
}
