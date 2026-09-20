"use client";

import type {
  DashboardAccount,
  DashboardLoanPayment,
  DashboardLoanSummary,
} from "@/domains/dashboard/domain/types";
import { LoanAccountRow } from "@/domains/dashboard/ui/LoanAccountRow";
import { CloudProcessingSwitchCard } from "@/domains/feature-flags/ui/CloudProcessingSwitch";
import { addMonths, format } from "date-fns";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const CAPTIONS = [
  "Add your mortgage, car, or student loan. Snap the paperwork instead of retyping it.",
  "See how much of each payment shrinks the loan and how close you are to done.",
  "Want AI to look at your budget? It only sees numbers once you flip this on.",
] as const;
const DURATIONS = CAPTIONS.map(captionMs);

function isoMonth(start: Date, months: number) {
  return format(addMonths(start, months), "yyyy-MM-dd");
}

function demoLoan(): { account: DashboardAccount; loan: DashboardLoanSummary } {
  const first = new Date(2023, 8, 1);
  const paymentCount = 60;
  const paymentsApplied = 37;
  const paymentAmount = 642.18;
  const remainingPrincipal = 14_820.4;
  const payments: DashboardLoanPayment[] = Array.from(
    { length: paymentsApplied },
    (_, index) => {
      const scheduledDate = isoMonth(first, index);
      return {
        paymentNumber: index + 1,
        scheduledDate,
        postedDate: scheduledDate,
        transactionId: `demo-${index + 1}`,
        paymentAmount,
        interestPortion: 80.12,
        principalPortion: 562.06,
        balanceAfter:
          remainingPrincipal + (paymentsApplied - 1 - index) * 562.06,
        assumed: false,
      };
    },
  );

  const loan: DashboardLoanSummary = {
    remainingPrincipal,
    nextPaymentDate: isoMonth(first, paymentsApplied),
    progressPct: 62,
    annualRate: 0.049,
    aprDisclosed: 0.049,
    paymentAmount,
    paymentCount,
    paymentsApplied,
    remainingPayments: paymentCount - paymentsApplied,
    firstPaymentDate: isoMonth(first, 0),
    maturityDate: isoMonth(first, paymentCount - 1),
    loanType: "auto",
    rateType: "fixed",
    vehicleLabel: "2021 Lexus IS",
    paidInterest: 2_964.44,
    paidPrincipal: 20_796.22,
    matchMerchantClean: "CIBC Auto Loan",
    txnDescriptionLookup: "CIBC AUTO LOAN",
    payments,
  };

  const account: DashboardAccount = {
    accountId: "demo-loan",
    name: "2021 Lexus IS",
    label: null,
    officialName: "Auto loan",
    mask: null,
    type: "loan",
    subtype: "auto",
    currentBalance: remainingPrincipal,
    availableBalance: null,
    isoCurrencyCode: "CAD",
    loanSummary: loan,
  };

  return { account, loan };
}

const DEMO = demoLoan();

export function LoansAiScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone);
  const cloudOn = step >= 2;

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      <div className="pointer-events-none flex min-h-0 flex-col justify-center gap-2 sm:gap-3">
        <div className="shrink-0 rounded-xl border border-border bg-surface">
          <LoanAccountRow
            account={DEMO.account}
            loan={DEMO.loan}
            timelineSize="sm"
            showTimelineColumnLabels={false}
            className="px-3 py-2.5"
          />
        </div>
        <CloudProcessingSwitchCard checked={cloudOn} dense />
      </div>
    </SceneFrame>
  );
}
