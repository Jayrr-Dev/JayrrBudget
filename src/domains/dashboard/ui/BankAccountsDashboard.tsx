"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { DashboardBudgets } from "@/domains/budgets/ui/DashboardBudgets";
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
import { displayAccountName } from "@/domains/dashboard/domain/accountName";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type {
  DashboardAccount,
  DashboardLoanSummary,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { AccountCategoryIcon } from "@/domains/dashboard/ui/AccountCategoryIcon";
import { AccountPastTransactions } from "@/domains/dashboard/ui/AccountPastTransactions";
import { AddLoanDialog } from "@/domains/dashboard/ui/AddLoanDialog";
import { BankAccountActions } from "@/domains/dashboard/ui/BankAccountActions";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { PiggyPageStatus } from "@/domains/ledger-ai/ui/PiggyPageStatus";
import {
  LOAN_TYPES,
  formatLoanRate,
  normalizeRateType,
} from "@/domains/loans/domain/loanTypes";
import { LoanAccountActions } from "@/domains/loans/ui/LoanAccountActions";
import { LoanPaymentTimeline } from "@/domains/loans/ui/LoanPaymentTimeline";
import { LoanTypeIcon } from "@/domains/loans/ui/LoanTypeIcon";
import { StatementUpload } from "@/domains/statements/ui/StatementUpload";
import { applyVaultLoanPaymentDecision } from "@/domains/vault/application/applyVaultLoanPaymentDecision";
import { vaultWriteReady } from "@/domains/vault/application/saveEncryptedLedger";
import { DecryptingStatus } from "@/domains/vault/ui/DecryptingStatus";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import {
  formatCompactDisplayDate,
  formatDisplayDate,
} from "@/shared/lib/format-date";
import { toastIfOffline } from "@/shared/offline/offlineWriteGuard";
import { useConvex } from "convex/react";
import { Info, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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

const ROW_LINK_CLASS =
  "transition-colors hover:bg-[var(--muted)]/70 focus-visible:bg-[var(--muted)]/70 focus-visible:outline-none";

function loanTypeProgressLine(loan: DashboardLoanSummary) {
  const typeLabel =
    LOAN_TYPES.find((t) => t.value === loan.loanType)?.label ?? "Loan";
  return `${loan.vehicleLabel ?? typeLabel} · ${loan.paymentsApplied} of ${loan.paymentCount} payments`;
}

function loanNextPaymentLine(loan: DashboardLoanSummary) {
  if (!loan.nextPaymentDate) return "Paid off";
  return `Next payment for ${formatCompactDisplayDate(loan.nextPaymentDate)}`;
}

function LoanAccountRow({
  account,
  loan,
  href,
}: {
  account: DashboardAccount;
  loan: DashboardLoanSummary;
  href: string;
}) {
  const category = resolveAccountCategory(account);
  const amount = displayBalanceAmount(account.currentBalance, category);
  const currency = account.isoCurrencyCode ?? "CAD";
  const fill = Math.min(100, Math.max(0, loan.progressPct));
  const percentLabel = `${Math.round(fill)}% paid`;
  const monthlyLabel = `${formatMoney(loan.paymentAmount, currency)}/m`;

  return (
    <div className={`group px-4 py-3.5 ${ROW_LINK_CLASS}`}>
      <Link
        href={href}
        className="flex items-start justify-between gap-3"
        aria-label={`Open ${displayAccountName(account)} details`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <LoanTypeIcon
            loanType={loan.loanType}
            className="mt-0.5 size-10 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-[16px] font-semibold text-[var(--foreground)] sm:text-[20px]">
                {displayAccountName(account)}
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
            <p className="whitespace-nowrap text-base font-semibold tabular-nums tracking-tight text-[var(--foreground)]">
              {formatMoney(amount, currency)}
            </p>
            <Badge className="mt-0.5 h-4 bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground tabular-nums sm:hidden">
              {monthlyLabel}
            </Badge>
            <p className="hidden text-xs text-[var(--muted-foreground)] sm:block">
              remaining
            </p>
          </div>
          <ChevronRight />
        </div>
      </Link>
      <div className="mt-3">
        <LoanPaymentTimeline loan={loan} compact />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs tabular-nums text-[var(--muted-foreground)]">
        <span>{percentLabel}</span>
        <span className="truncate">{loanTypeProgressLine(loan)}</span>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  href,
}: {
  account: DashboardAccount;
  href: string;
}) {
  const loan = account.loanSummary;
  if (loan) return <LoanAccountRow account={account} loan={loan} href={href} />;

  const category = resolveAccountCategory(account);
  const amount = displayBalanceAmount(account.currentBalance, category);

  const title = displayAccountName(account);

  return (
    <div className={`px-4 py-3.5 ${ROW_LINK_CLASS}`}>
      <Link
        href={href}
        className="flex items-center justify-between gap-3"
        aria-label={`Open ${title} details`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <AccountCategoryIcon
            category={category}
            className="mt-0.5 size-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[var(--foreground)] sm:text-[20px]">
              {title}
            </p>
            <p className="truncate text-sm text-[var(--muted-foreground)]">
              {accountSecondaryLine(account)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <p className="whitespace-nowrap text-right text-base font-semibold tabular-nums tracking-tight text-[var(--foreground)]">
            {formatMoney(amount, account.isoCurrencyCode ?? "CAD")}
          </p>
          <ChevronRight />
        </div>
      </Link>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-baseline gap-4 py-2 text-sm">
      <span className="wrap-break-word text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="min-w-0 wrap-anywhere text-right font-medium text-[var(--foreground)]">
        {value}
      </span>
    </div>
  );
}

function LoanPaymentHistory({
  accountId,
  loan,
  currency,
}: {
  accountId: string;
  loan: DashboardLoanSummary;
  currency: string;
}) {
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const [busyNumber, setBusyNumber] = useState<number | null>(null);
  const rows = [...loan.payments].sort(
    (a, b) => b.paymentNumber - a.paymentNumber,
  );

  async function decidePayment(
    paymentNumber: number,
    decision: "confirm" | "remove",
  ) {
    if (toastIfOffline()) return;
    const write = vaultWriteReady({
      encryptedLedger: privateLedger.encryptedLedger,
      userId: privateLedger.userId,
      vaultId: privateLedger.vaultId,
      keyId: privateLedger.keyId,
      client,
    });
    if (!write) {
      toast.error("Unlock the vault to update this payment.");
      return;
    }
    if (privateLedger.loading) {
      toast.error("Wait for the vault to finish unlocking.");
      return;
    }
    setBusyNumber(paymentNumber);
    try {
      const next = await applyVaultLoanPaymentDecision({
        ctx: write,
        ledger: privateLedger.ledger,
        accountId,
        paymentNumber,
        decision,
      });
      privateLedger.applyLedger(next);
      privateLedger.reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update payment",
      );
    } finally {
      setBusyNumber(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        Payment history
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About payment history"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-72">
            <PopoverHeader>
              <PopoverTitle>Payment history</PopoverTitle>
              <PopoverDescription>
                Assumed rows stay off the balance until you confirm them.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Matched bank transactions confirm themselves</li>
                <li>Confirm applies the scheduled payment</li>
                <li>Remove drops that assumed row</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="sticky left-0 z-10 bg-surface-elevated px-3 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
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
                  <td className="sticky left-0 z-10 bg-surface-elevated px-2 py-2">
                    {row.assumed ? (
                      <RowActionsMenu
                        label={`payment ${row.paymentNumber}`}
                        size="md"
                        actions={[
                          {
                            label:
                              busyNumber === row.paymentNumber
                                ? "Confirming..."
                                : "Confirm",
                            disabled: busyNumber === row.paymentNumber,
                            onSelect: () =>
                              void decidePayment(row.paymentNumber, "confirm"),
                          },
                          {
                            label:
                              busyNumber === row.paymentNumber
                                ? "Removing..."
                                : "Remove",
                            variant: "destructive",
                            disabled: busyNumber === row.paymentNumber,
                            onSelect: () =>
                              void decidePayment(row.paymentNumber, "remove"),
                          },
                        ]}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.paymentNumber}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">
                    {formatDisplayDate(row.scheduledDate)}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--muted-foreground)]">
                    {row.assumed
                      ? "assumed"
                      : row.transactionId
                        ? formatDisplayDate(row.postedDate)
                        : "Confirmed"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText amount={row.paymentAmount} currency={currency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      amount={row.interestPortion}
                      currency={currency}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      amount={row.principalPortion}
                      currency={currency}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    <MoneyText amount={row.balanceAfter} currency={currency} />
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
        <header className="space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            {loan ? (
              <LoanTypeIcon
                loanType={loan.loanType}
                className="mt-1 size-10 shrink-0"
              />
            ) : (
              <AccountCategoryIcon
                category={category}
                className="mt-1 size-10 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <h1 className="type-page min-w-0 wrap-anywhere">
                    {displayAccountName(account)}
                  </h1>
                  {loan ? (
                    <Badge className="h-6 shrink-0 bg-accent px-2 text-xs font-semibold text-accent-foreground tabular-nums">
                      {`${formatMoney(loan.paymentAmount, currency)}/m`}
                    </Badge>
                  ) : null}
                </div>
                <div className="ml-auto shrink-0">
                  {loan ? (
                    <LoanAccountActions
                      accountId={account.accountId}
                      accountName={displayAccountName(account)}
                    />
                  ) : (
                    <BankAccountActions account={account} size="sm" />
                  )}
                </div>
              </div>
              <p className="type-muted wrap-anywhere">
                {loan
                  ? loanNextPaymentLine(loan)
                  : accountSecondaryLine(account)}
              </p>
            </div>
          </div>
        </header>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
        <div className="grid gap-2 px-4 py-5 sm:px-5 sm:py-6 lg:grid-cols-2 lg:gap-10">
          <div>
            <p className="type-muted">
              {loan ? "Principal remaining" : "Balance"}
            </p>
            <p className="type-stat mt-1 wrap-anywhere">
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
                      LOAN_TYPES.find(
                        (t) => t.value === loan.loanType,
                      )?.collateralLabel.replace(" (optional)", "") ?? "Note"
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
        <>
          <LoanPaymentTimeline loan={loan} />
          <LoanPaymentHistory
            accountId={account.accountId}
            loan={loan}
            currency={currency}
          />
        </>
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

function SectionCardSpinner() {
  const encrypted = usePrivateLedger().encryptedLedger;
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-[var(--border)] bg-surface-elevated">
      {encrypted ? <DecryptingStatus /> : <PiggyPageStatus />}
    </div>
  );
}

const LOADING_SECTIONS: AccountSectionId[] = ["deposit", "credit", "lending"];

function AddLendingAccountButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="relative size-6 max-md:size-6 shrink-0 rounded-full border border-border text-accent hover:bg-accent-subtle hover:text-accent after:absolute after:-inset-3.5 after:content-['']"
      aria-label="Register Lending Account"
      onClick={onClick}
    >
      <PlusIcon className="size-3.5" />
    </Button>
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
  loading = false,
  showBudgets = false,
}: {
  accounts: DashboardAccount[];
  transactions?: DashboardTransaction[];
  /** When set (e.g. from `/accounts?account=`), open that account's detail view. */
  selectedAccountId?: string | null;
  loading?: boolean;
  /** Home dashboard: budget rings after lending. Hidden when empty. */
  showBudgets?: boolean;
}) {
  const router = useRouter();
  const [addLoanOpen, setAddLoanOpen] = useState(false);
  const encrypted = usePrivateLedger().encryptedLedger;

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

  if (loading && selectedAccountId) {
    return (
      <div className="space-y-8">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
          <div className="flex min-h-64 items-center justify-center">
            {encrypted ? <DecryptingStatus /> : <PiggyPageStatus />}
          </div>
        </div>
      </div>
    );
  }

  if (selectedAccount) {
    return (
      <AccountDetailView
        account={selectedAccount}
        transactions={selectedTransactions}
        onBack={() => router.replace("/accounts")}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-8">
        {LOADING_SECTIONS.map((id) => (
          <section key={id} className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <h2 className="text-[14px] font-bold tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
                {ACCOUNT_SECTION_LABELS[id]}
              </h2>
              {id === "lending" ? (
                <AddLendingAccountButton onClick={() => setAddLoanOpen(true)} />
              ) : null}
            </div>
            <SectionCardSpinner />
          </section>
        ))}
        <AddLoanDialog open={addLoanOpen} onOpenChange={setAddLoanOpen} />
      </div>
    );
  }

  const hasNonLending = sections.some(
    (section) => section.id !== "lending" && section.accounts.length > 0,
  );

  return (
    <div className="space-y-8">
      {!hasNonLending && accounts.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl border border-dashed border-[var(--border)] bg-surface-elevated/70 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="font-medium text-[var(--foreground)]">
              Start by importing a statement
            </h2>
            <p className="max-w-lg text-sm text-[var(--muted-foreground)]">
              Upload a bank statement PDF to create your accounts and import the
              transactions automatically.
            </p>
          </div>
          <StatementUpload />
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.id} className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <h2 className="text-[14px] font-bold tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
              {section.label}
            </h2>
            {section.id === "lending" ? (
              <AddLendingAccountButton onClick={() => setAddLoanOpen(true)} />
            ) : null}
          </div>
          {section.accounts.length === 0 ? (
            section.id === "lending" ? (
              <EmptyPrompt
                className="bg-surface-elevated/70 py-6"
                title="No lending accounts yet"
                description="Register a loan with amortization terms."
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAddLoanOpen(true)}
                  >
                    Register lending account
                  </Button>
                }
              />
            ) : null
          ) : (
            <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
              {section.accounts.map((account, index) => (
                <li
                  key={account.accountId}
                  className={index > 0 ? "border-t border-[var(--border)]" : ""}
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

      {showBudgets ? <DashboardBudgets /> : null}

      <AddLoanDialog open={addLoanOpen} onOpenChange={setAddLoanOpen} />
    </div>
  );
}
