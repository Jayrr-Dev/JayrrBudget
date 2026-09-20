"use client";

import { Badge } from "@/components/ui/badge";
import type { SquareTimelineSize } from "@/components/ui/square-timeline";
import {
  displayBalanceAmount,
  resolveAccountCategory,
} from "@/domains/dashboard/domain/accountCategory";
import { displayAccountName } from "@/domains/dashboard/domain/accountName";
import { formatMoney } from "@/domains/dashboard/domain/money";
import { balanceTone } from "@/domains/dashboard/domain/moneyTone";
import type {
  DashboardAccount,
  DashboardLoanSummary,
} from "@/domains/dashboard/domain/types";
import { moneyToneClass } from "@/domains/dashboard/ui/MoneyText";
import { LOAN_TYPES } from "@/domains/loans/domain/loanTypes";
import { LoanPaymentTimeline } from "@/domains/loans/ui/LoanPaymentTimeline";
import { LoanTypeIcon } from "@/domains/loans/ui/LoanTypeIcon";
import { cn } from "@/lib/utils";
import { formatCompactDisplayDate } from "@/shared/lib/format-date";
import Link from "next/link";

const ROW_LINK_CLASS =
  "transition-colors hover:bg-[var(--muted)]/70 focus-visible:bg-[var(--muted)]/70 focus-visible:outline-none";

function loanTypeProgressLine(loan: DashboardLoanSummary) {
  const typeLabel =
    LOAN_TYPES.find((t) => t.value === loan.loanType)?.label ?? "Loan";
  return `${loan.vehicleLabel ?? typeLabel} · ${loan.paymentsApplied} of ${loan.paymentCount} payments`;
}

export function loanNextPaymentLine(loan: DashboardLoanSummary) {
  if (!loan.nextPaymentDate) return "Paid off";
  return `Next payment for ${formatCompactDisplayDate(loan.nextPaymentDate)}`;
}

export function LoanRowChevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 text-[var(--muted-foreground)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoanAccountRow({
  account,
  loan,
  href,
  timelineSize,
  showTimelineColumnLabels = true,
  className,
}: {
  account: DashboardAccount;
  loan: DashboardLoanSummary;
  href?: string;
  timelineSize?: SquareTimelineSize;
  showTimelineColumnLabels?: boolean;
  className?: string;
}) {
  const category = resolveAccountCategory(account);
  const amount = displayBalanceAmount(account.currentBalance, category);
  const currency = account.isoCurrencyCode ?? "CAD";
  const fill = Math.min(100, Math.max(0, loan.progressPct));
  const percentLabel = `${Math.round(fill)}% paid`;
  const monthlyLabel = `${formatMoney(loan.paymentAmount, currency)}/m`;
  const title = displayAccountName(account);
  const linked = Boolean(href);

  const header = (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <LoanTypeIcon
          loanType={loan.loanType}
          className="mt-0.5 size-10 shrink-0"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-[16px] font-semibold text-[var(--foreground)] sm:text-[20px]">
              {title}
            </p>
            <Badge className="hidden h-5 shrink-0 bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground tabular-nums sm:inline-flex">
              {monthlyLabel}
            </Badge>
          </div>
          <p className="truncate text-base text-[var(--muted-foreground)]">
            {loanNextPaymentLine(loan)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <div className="flex flex-col items-end text-right">
          <p
            className={cn(
              "whitespace-nowrap text-base font-semibold tabular-nums tracking-tight",
              moneyToneClass(balanceTone(account.currentBalance, "liability")),
            )}
          >
            {formatMoney(amount, currency)}
          </p>
          <Badge className="mt-0.5 h-4 bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground tabular-nums sm:hidden">
            {monthlyLabel}
          </Badge>
          <p className="hidden text-xs text-[var(--muted-foreground)] sm:block">
            remaining
          </p>
        </div>
        {linked ? <LoanRowChevron /> : null}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "group px-4 py-3.5",
        linked ? ROW_LINK_CLASS : null,
        className,
      )}
    >
      {href ? (
        <Link
          href={href}
          className="flex items-start justify-between gap-3"
          aria-label={`Open ${title} details`}
        >
          {header}
        </Link>
      ) : (
        <div className="flex items-start justify-between gap-3">{header}</div>
      )}
      <div className="mt-3">
        <LoanPaymentTimeline
          loan={loan}
          compact
          size={timelineSize ?? "xl"}
          showColumnLabels={showTimelineColumnLabels}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs tabular-nums text-[var(--muted-foreground)]">
        <span>{percentLabel}</span>
        <span className="truncate">{loanTypeProgressLine(loan)}</span>
      </div>
    </div>
  );
}
