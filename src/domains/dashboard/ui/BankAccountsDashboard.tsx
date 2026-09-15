"use client";

import { Button } from "@/components/ui/button";
import {
  ACCOUNT_SECTION_LABELS,
  detectCardNetwork,
  displayBalanceAmount,
  formatAccountNumber,
  groupAccountsBySection,
  resolveAccountCategory,
  type AccountCategory,
  type AccountSectionId,
  type CardNetwork,
} from "@/domains/dashboard/domain/accountCategory";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type {
  DashboardAccount,
  DashboardLoanSummary,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { AccountPastTransactions } from "@/domains/dashboard/ui/AccountPastTransactions";
import { AddLoanDialog } from "@/domains/dashboard/ui/AddLoanDialog";
import { LOAN_TYPES, formatLoanRate, normalizeRateType } from "@/domains/loans/domain/loanTypes";
import { StatementUpload } from "@/domains/statements/ui/StatementUpload";
import { formatDisplayDate } from "@/shared/lib/format-date";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function accountDetailHref(accountId: string) {
  return `/accounts?account=${encodeURIComponent(accountId)}`;
}

const NETWORK_LABEL: Record<CardNetwork, string | null> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  unknown: null,
};

const CATEGORY_LABEL: Record<AccountCategory, string | null> = {
  chequing: "Chequing",
  savings: "Savings",
  other: null,
  credit_card: "Credit",
  lending: "Lending",
};

function accountSecondaryLine(account: DashboardAccount) {
  const category = resolveAccountCategory(account);
  const loan = account.loanSummary;
  if (loan) {
    const typeLabel =
      LOAN_TYPES.find((t) => t.value === loan.loanType)?.label ?? null;
    const bits = [
      loan.vehicleLabel,
      typeLabel && !loan.vehicleLabel ? typeLabel : null,
      `${loan.paymentsApplied}/${loan.paymentCount} payments`,
    ].filter(Boolean);
    return bits.join(" · ");
  }
  const number = formatAccountNumber(account, category);
  const extra =
    category === "credit_card"
      ? NETWORK_LABEL[detectCardNetwork(account)]
      : CATEGORY_LABEL[category];
  return [number, extra].filter(Boolean).join(" · ");
}

function AccountRow({
  account,
  href,
}: {
  account: DashboardAccount;
  href: string;
}) {
  const category = resolveAccountCategory(account);
  const amount = displayBalanceAmount(account.currentBalance, category);
  const loan = account.loanSummary;

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--muted)]/70 focus-visible:bg-[var(--muted)]/70 focus-visible:outline-none"
      aria-label={`Open ${account.name} details`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--foreground)]">
          {account.name}
        </p>
        <p className="truncate text-sm text-[var(--muted-foreground)]">
          {accountSecondaryLine(account)}
        </p>
        {loan ? (
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            {loan.progressPct.toFixed(0)}% paid
            {loan.nextPaymentDate
              ? ` · next ${loan.nextPaymentDate}`
              : " · paid off"}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <p className="text-right text-base font-semibold tabular-nums tracking-tight text-[var(--foreground)]">
          {formatMoney(amount, account.isoCurrencyCode ?? "CAD")}
        </p>
        <ChevronRight />
      </div>
    </Link>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="text-right font-medium text-[var(--foreground)]">
        {value}
      </span>
    </div>
  );
}

function LoanPaymentHistory({
  loan,
  currency,
}: {
  loan: DashboardLoanSummary;
  currency: string;
}) {
  const rows = [...loan.payments].sort(
    (a, b) => b.paymentNumber - a.paymentNumber,
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Payment history</h2>
      <p className="text-sm text-[var(--muted-foreground)]">
        Contract schedule from {loan.firstPaymentDate}. Linked PADs show posted
        date; assumed rows fill gaps before import.
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Scheduled</th>
                <th className="px-3 py-2 font-medium">Posted</th>
                <th className="px-3 py-2 font-medium text-right">Payment</th>
                <th className="px-3 py-2 font-medium text-right">Interest</th>
                <th className="px-3 py-2 font-medium text-right">Principal</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.paymentNumber}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2 tabular-nums">
                    {row.paymentNumber}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">
                    {formatDisplayDate(row.scheduledDate)}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--muted-foreground)]">
                    {row.assumed
                      ? "assumed"
                      : formatDisplayDate(row.postedDate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.paymentAmount, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.interestPortion, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.principalPortion, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatMoney(row.balanceAfter, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AccountDetailView({
  account,
  transactions,
  onBack,
}: {
  account: DashboardAccount;
  transactions: DashboardTransaction[];
  onBack: () => void;
}) {
  const category = resolveAccountCategory(account);
  const currency = account.isoCurrencyCode ?? "CAD";
  const number = formatAccountNumber(account, category);
  const balance = displayBalanceAmount(account.currentBalance, category);
  const available =
    account.availableBalance != null
      ? displayBalanceAmount(account.availableBalance, category)
      : null;
  const loan = account.loanSummary;

  const pendingTxns = transactions.filter((txn) => txn.pending);
  const pendingTotal = pendingTxns.reduce((sum, txn) => sum + txn.amount, 0);

  const productName =
    account.officialName?.trim() ||
    account.name ||
    [account.type, account.subtype].filter(Boolean).join(" · ") ||
    "-";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <span aria-hidden>←</span>
          All accounts
        </Button>
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {account.name}
          </h1>
          <p className="text-[var(--muted-foreground)]">
            {accountSecondaryLine(account)}
          </p>
        </header>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid gap-2 px-4 py-5 sm:px-5 sm:py-6 lg:grid-cols-2 lg:gap-10">
          <div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {loan ? "Principal remaining" : "Balance"}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(balance, currency)}
            </p>
            <div className="mt-4 divide-y divide-[var(--border)]">
              {loan ? (
                <>
                  <DetailRow
                    label="Progress"
                    value={`${loan.progressPct.toFixed(1)}% · ${loan.paymentsApplied} of ${loan.paymentCount}`}
                  />
                  <DetailRow
                    label="Interest paid"
                    value={formatMoney(loan.paidInterest, currency)}
                  />
                  <DetailRow
                    label="Principal paid"
                    value={formatMoney(loan.paidPrincipal, currency)}
                  />
                  <DetailRow
                    label="Next payment"
                    value={
                      loan.nextPaymentDate
                        ? `${formatMoney(loan.paymentAmount, currency)} on ${loan.nextPaymentDate}`
                        : "Paid off"
                    }
                  />
                </>
              ) : (
                <>
                  <DetailRow
                    label="Pending"
                    value={
                      pendingTxns.length === 0
                        ? formatMoney(0, currency)
                        : `${formatMoney(Math.abs(pendingTotal), currency)} (${pendingTxns.length})`
                    }
                  />
                  <DetailRow
                    label="Available"
                    value={formatMoney(available ?? balance, currency)}
                  />
                  <DetailRow
                    label="Current"
                    value={formatMoney(balance, currency)}
                  />
                </>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <DetailRow label="Product" value={productName} />
            {loan ? (
              <>
                <DetailRow
                  label="Loan type"
                  value={
                    LOAN_TYPES.find((t) => t.value === loan.loanType)?.label ??
                    account.subtype ??
                    "Loan"
                  }
                />
                {loan.vehicleLabel ? (
                  <DetailRow
                    label={
                      LOAN_TYPES.find((t) => t.value === loan.loanType)
                        ?.collateralLabel.replace(" (optional)", "") ?? "Note"
                    }
                    value={loan.vehicleLabel}
                  />
                ) : null}
                <DetailRow
                  label="Rate"
                  value={formatLoanRate(
                    loan.annualRate,
                    normalizeRateType(loan.rateType),
                    loan.aprDisclosed,
                  )}
                />
                <DetailRow
                  label="First payment"
                  value={loan.firstPaymentDate}
                />
                <DetailRow label="Maturity" value={loan.maturityDate} />
                <DetailRow
                  label="Remaining"
                  value={`${loan.remainingPayments} payments`}
                />
              </>
            ) : (
              <>
                <DetailRow
                  label="Account"
                  value={account.mask ? `•••• ${account.mask}` : number || "-"}
                />
                <DetailRow
                  label="Type"
                  value={
                    [account.type, account.subtype]
                      .filter(Boolean)
                      .join(" · ") || category.replaceAll("_", " ")
                  }
                />
              </>
            )}
          </div>
        </div>
      </div>

      {loan ? (
        <LoanPaymentHistory loan={loan} currency={currency} />
      ) : (
        <AccountPastTransactions
          transactions={transactions}
          currentBalance={account.currentBalance}
          currency={currency}
        />
      )}
    </div>
  );
}

function ChevronRight() {
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

/** Grouped account list, or a single account detail when `selectedAccountId` is set. */
export function BankAccountsDashboard({
  accounts,
  transactions = [],
  selectedAccountId = null,
}: {
  accounts: DashboardAccount[];
  transactions?: DashboardTransaction[];
  /** When set (e.g. from `/accounts?account=`), open that account's detail view. */
  selectedAccountId?: string | null;
}) {
  const router = useRouter();
  const [addLoanOpen, setAddLoanOpen] = useState(false);

  const sections = useMemo(() => {
    const grouped = groupAccountsBySection(accounts);
    if (grouped.some((section) => section.id === "lending")) return grouped;
    return [
      ...grouped,
      {
        id: "lending" as AccountSectionId,
        label: ACCOUNT_SECTION_LABELS.lending,
        accounts: [] as DashboardAccount[],
      },
    ];
  }, [accounts]);

  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return (
      accounts.find((account) => account.accountId === selectedAccountId) ??
      null
    );
  }, [accounts, selectedAccountId]);

  const selectedTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return transactions.filter(
      (txn) => txn.accountId === selectedAccount.accountId,
    );
  }, [transactions, selectedAccount]);

  if (selectedAccount) {
    return (
      <AccountDetailView
        account={selectedAccount}
        transactions={selectedTransactions}
        onBack={() => router.replace("/accounts")}
      />
    );
  }

  const hasNonLending = sections.some(
    (section) => section.id !== "lending" && section.accounts.length > 0,
  );

  return (
    <div className="space-y-8">
      {!hasNonLending && accounts.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/70 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="font-medium text-[var(--foreground)]">
              Start by importing a statement
            </h2>
            <p className="max-w-lg text-sm text-[var(--muted-foreground)]">
              Upload a bank statement PDF to create your accounts and import
              the transactions automatically.
            </p>
          </div>
          <StatementUpload />
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.id} className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <h2 className="text-xs font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
              {section.label}
            </h2>
            {section.id === "lending" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-4 shrink-0 rounded-full border border-[var(--border)] text-[var(--muted-foreground)]"
                aria-label="Add loan"
                onClick={() => setAddLoanOpen(true)}
              >
                <PlusIcon className="size-2.5" />
              </Button>
            ) : null}
          </div>
          {section.accounts.length === 0 ? (
            section.id === "lending" ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/70 px-4 py-6 text-sm text-[var(--muted-foreground)]">
                No lending accounts yet. Use + to add a custom loan.
              </div>
            ) : null
          ) : (
            <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {section.accounts.map((account, index) => (
                <li
                  key={account.accountId}
                  className={
                    index > 0 ? "border-t border-[var(--border)]" : ""
                  }
                >
                  <AccountRow
                    account={account}
                    href={accountDetailHref(account.accountId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <AddLoanDialog open={addLoanOpen} onOpenChange={setAddLoanOpen} />
    </div>
  );
}

export function BankAccountsLoadingSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((section) => (
        <div key={section} className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {[0, 1].map((row) => (
              <div
                key={row}
                className={`flex items-center justify-between px-4 py-3.5 ${row > 0 ? "border-t border-[var(--border)]" : ""}`}
              >
                <div className="space-y-2">
                  <div className="h-4 w-48 animate-pulse rounded bg-[var(--surface-2)]" />
                  <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
                </div>
                <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
