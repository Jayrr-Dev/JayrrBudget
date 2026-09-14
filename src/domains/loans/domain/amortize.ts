/** Amortization schedule for custom lending accounts. */

import {
  frequencyMeta,
  normalizePaymentFrequency,
  periodRate,
  type PaymentFrequency,
} from "@/domains/loans/domain/paymentFrequency";

export type LoanTermsInput = {
  principalStart: number;
  annualRate: number;
  paymentAmount: number;
  paymentCount: number;
  firstPaymentDate: string;
  paymentFrequency?: PaymentFrequency | string;
  /** When set with overrideAsOf, restart balance from this principal after that date. */
  principalOverride?: number | null;
  overrideAsOf?: string | null;
};

export type MatchedPad = {
  transactionId: string;
  postedDate: string;
  amount: number;
};

export type LoanPaymentStep = {
  paymentNumber: number;
  scheduledDate: string;
  postedDate: string | null;
  transactionId: string | null;
  paymentAmount: number;
  interestPortion: number;
  principalPortion: number;
  balanceAfter: number;
  /** True when no chequing PAD was matched (contractual / pre-import). */
  assumed: boolean;
  applied: boolean;
};

export type AmortizeResult = {
  schedule: LoanPaymentStep[];
  currentBalance: number;
  paidInterest: number;
  paidPrincipal: number;
  paymentsApplied: number;
  remainingPayments: number;
  nextPaymentDate: string | null;
  progressPct: number;
};

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenIso(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T12:00:00.000Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T12:00:00.000Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** @deprecated Prefer periodRate(annualRate, "biweekly"). */
export function biweeklyRate(annualRate: number): number {
  return periodRate(annualRate, "biweekly");
}

export function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const cursor = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cursor.setUTCDate(Math.min(day!, lastDay));
  return cursor.toISOString().slice(0, 10);
}

export function buildScheduledDates(
  firstPaymentDate: string,
  paymentCount: number,
  frequency: PaymentFrequency | string = "biweekly",
): string[] {
  const normalized = normalizePaymentFrequency(String(frequency));
  const dates: string[] = [];
  if (normalized === "monthly") {
    for (let n = 0; n < paymentCount; n += 1) {
      dates.push(addMonthsIso(firstPaymentDate, n));
    }
    return dates;
  }
  const days = frequencyMeta(normalized).days ?? 14;
  for (let n = 0; n < paymentCount; n += 1) {
    dates.push(addDaysIso(firstPaymentDate, n * days));
  }
  return dates;
}

/**
 * Pair PAD candidates to schedule slots (greedy, date proximity then amount).
 * One transaction → one payment number.
 */
export function matchPadsToSchedule(
  scheduledDates: string[],
  pads: MatchedPad[],
  matchAmount: number,
  maxDayDelta = 5,
): Map<number, MatchedPad> {
  const unused = [...pads].sort((a, b) =>
    a.postedDate.localeCompare(b.postedDate),
  );
  const matched = new Map<number, MatchedPad>();

  for (let i = 0; i < scheduledDates.length; i += 1) {
    const scheduled = scheduledDates[i]!;
    let bestIdx = -1;
    let bestDelta = maxDayDelta + 1;

    for (let j = 0; j < unused.length; j += 1) {
      const pad = unused[j]!;
      if (Math.abs(pad.amount - matchAmount) > 0.02) continue;
      const delta = Math.abs(daysBetweenIso(scheduled, pad.postedDate));
      if (delta > maxDayDelta) continue;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      matched.set(i + 1, unused[bestIdx]!);
      unused.splice(bestIdx, 1);
    }
  }

  return matched;
}

/**
 * Build full amortization schedule and as-of balance.
 * Payments with scheduledDate <= asOfDate are applied (assumed if no PAD).
 */
export function amortizeLoan(
  terms: LoanTermsInput,
  asOfDate: string,
  matchedByPaymentNumber: Map<number, MatchedPad>,
): AmortizeResult {
  const asOf = asOfDate.slice(0, 10);
  const frequency = normalizePaymentFrequency(
    String(terms.paymentFrequency ?? "biweekly"),
  );
  const r = periodRate(terms.annualRate, frequency);
  const scheduledDates = buildScheduledDates(
    terms.firstPaymentDate,
    terms.paymentCount,
    frequency,
  );

  const hasOverride =
    terms.principalOverride != null &&
    Number.isFinite(terms.principalOverride) &&
    Boolean(terms.overrideAsOf?.trim());

  let balance = terms.principalStart;
  let overrideArmed = false;
  const schedule: LoanPaymentStep[] = [];
  let paidInterest = 0;
  let paidPrincipal = 0;
  let paymentsApplied = 0;
  let currentBalance = terms.principalStart;
  let nextPaymentDate: string | null = null;

  for (let n = 1; n <= terms.paymentCount; n += 1) {
    const scheduledDate = scheduledDates[n - 1]!;
    const pad = matchedByPaymentNumber.get(n) ?? null;

    if (
      hasOverride &&
      !overrideArmed &&
      scheduledDate > terms.overrideAsOf!.slice(0, 10)
    ) {
      balance = roundCents(terms.principalOverride!);
      overrideArmed = true;
    }

    let interest = roundCents(balance * r);
    let payment = terms.paymentAmount;
    let principal = roundCents(payment - interest);

    if (principal >= balance || n === terms.paymentCount) {
      principal = roundCents(balance);
      payment = roundCents(interest + principal);
      if (interest > payment) {
        interest = payment;
        principal = 0;
      }
    }

    balance = roundCents(Math.max(0, balance - principal));

    const applied = scheduledDate <= asOf;
    const step: LoanPaymentStep = {
      paymentNumber: n,
      scheduledDate,
      postedDate: pad?.postedDate ?? (applied ? scheduledDate : null),
      transactionId: pad?.transactionId ?? null,
      paymentAmount: payment,
      interestPortion: interest,
      principalPortion: principal,
      balanceAfter: balance,
      assumed: applied && !pad,
      applied,
    };
    schedule.push(step);

    if (applied) {
      paidInterest = roundCents(paidInterest + interest);
      paidPrincipal = roundCents(paidPrincipal + principal);
      paymentsApplied += 1;
      currentBalance = balance;
    } else if (nextPaymentDate == null) {
      nextPaymentDate = scheduledDate;
    }
  }

  if (paymentsApplied === 0) {
    currentBalance = hasOverride
      ? roundCents(terms.principalOverride!)
      : terms.principalStart;
  }

  const remainingPayments = Math.max(0, terms.paymentCount - paymentsApplied);
  const progressPct =
    terms.paymentCount > 0
      ? roundCents((paymentsApplied / terms.paymentCount) * 100)
      : 0;

  return {
    schedule,
    currentBalance,
    paidInterest,
    paidPrincipal,
    paymentsApplied,
    remainingPayments,
    nextPaymentDate,
    progressPct,
  };
}
