"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
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
import {
  accountClassFor,
  balanceTone,
} from "@/domains/dashboard/domain/moneyTone";
import type {
  DashboardAccount,
  DashboardLoanPayment,
  DashboardLoanSummary,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { AccountCategoryIcon } from "@/domains/dashboard/ui/AccountCategoryIcon";
import { AccountPastTransactions } from "@/domains/dashboard/ui/AccountPastTransactions";
import { AddLoanDialog } from "@/domains/dashboard/ui/AddLoanDialog";
import { BankAccountActions } from "@/domains/dashboard/ui/BankAccountActions";
import {
  LoanAccountRow,
  LoanRowChevron,
} from "@/domains/dashboard/ui/LoanAccountRow";
import { MoneyText, moneyToneClass } from "@/domains/dashboard/ui/MoneyText";
import { PiggyPageStatus } from "@/domains/ledger-ai/ui/PiggyPageStatus";
import {
  LOAN_TYPES,
  formatLoanRate,
  normalizeRateType,
} from "@/domains/loans/domain/loanTypes";
import { LoanAccountActions } from "@/domains/loans/ui/LoanAccountActions";
import { LoanPaymentTimeline } from "@/domains/loans/ui/LoanPaymentTimeline";
import { LoanTxnDescriptionLookupsField } from "@/domains/loans/ui/LoanTxnDescriptionLookupsField";
import { LoanTypeIcon } from "@/domains/loans/ui/LoanTypeIcon";
import { DashboardPings } from "@/domains/piggy-pings/ui/DashboardPings";
import { StatementUpload } from "@/domains/statements/ui/StatementUpload";
import { applyVaultLoanPaymentDecision } from "@/domains/vault/application/applyVaultLoanPaymentDecision";
import { vaultWriteReady } from "@/domains/vault/application/saveEncryptedLedger";
import { DecryptingStatus } from "@/domains/vault/ui/DecryptingStatus";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { cn } from "@/lib/utils";
import { formatLongDisplayDate } from "@/shared/lib/format-date";
import { toastIfOffline } from "@/shared/offline/offlineWriteGuard";
import { createColumnHelper } from "@tanstack/react-table";
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
          <p
            className={cn(
              "whitespace-nowrap text-right text-base font-semibold tabular-nums tracking-tight",
              moneyToneClass(
                balanceTone(account.currentBalance, accountClassFor(account)),
              ),
            )}
          >
            {formatMoney(amount, account.isoCurrencyCode ?? "CAD")}
          </p>
          <LoanRowChevron />
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

type PaymentHistoryRow = DashboardLoanPayment & {
  description: string;
};

const paymentHistoryHelper = createColumnHelper<
  DataTableFeatures,
  PaymentHistoryRow
>();

function loanPaymentDescription(
  payment: DashboardLoanPayment,
  txn: DashboardTransaction | undefined,
  lookup: string,
): string {
  const fromTxn =
    txn?.originalDescription?.trim() ||
    txn?.name?.trim() ||
    txn?.merchantClean?.trim() ||
    "";
  if (fromTxn) return fromTxn;
  const phrase = lookup.trim();
  if (payment.assumed) {
    if (phrase) return phrase;
    return "Assumed payment";
  }
  if (payment.transactionId) return "Matched payment";
  return "Confirmed payment";
}

function postedLabel(row: PaymentHistoryRow): string {
  if (row.assumed) return "Assumed";
  if (row.transactionId) return formatLongDisplayDate(row.postedDate);
  return "Confirmed";
}

function LoanPaymentHistory({
  accountId,
  loan,
  currency,
  transactions,
}: {
  accountId: string;
  loan: DashboardLoanSummary;
  currency: string;
  transactions: DashboardTransaction[];
}) {
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const [busyNumber, setBusyNumber] = useState<number | null>(null);
  const lookup = loan.txnDescriptionLookup || loan.matchMerchantClean;

  const rows = useMemo(() => {
    const byTxnId = new Map(
      transactions.map((txn) => [txn.transactionId, txn] as const),
    );
    return [...loan.payments]
      .sort((a, b) => b.paymentNumber - a.paymentNumber)
      .map((payment) => ({
        ...payment,
        description: loanPaymentDescription(
          payment,
          payment.transactionId
            ? byTxnId.get(payment.transactionId)
            : undefined,
          lookup,
        ),
      }));
  }, [loan.payments, lookup, transactions]);

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

  const columns = useMemo(
    () =>
      paymentHistoryHelper.columns([
        paymentHistoryHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            if (!row.original.assumed) return null;
            const paymentNumber = row.original.paymentNumber;
            const busy = busyNumber === paymentNumber;
            return (
              <div className="flex items-center justify-center">
                <RowActionsMenu
                  label={`payment ${paymentNumber}`}
                  size="sm"
                  actions={[
                    {
                      label: busy ? "Confirming..." : "Confirm",
                      disabled: busy,
                      onSelect: () =>
                        void decidePayment(paymentNumber, "confirm"),
                    },
                    {
                      label: busy ? "Removing..." : "Remove",
                      variant: "destructive",
                      disabled: busy,
                      onSelect: () =>
                        void decidePayment(paymentNumber, "remove"),
                    },
                  ]}
                />
              </div>
            );
          },
          enableSorting: false,
          enableHiding: false,
          meta: { label: "Actions", width: "2rem", keepOpaque: true },
        }),
        paymentHistoryHelper.group({
          id: "main",
          header: "Main",
          columns: paymentHistoryHelper.columns([
            paymentHistoryHelper.accessor("scheduledDate", {
              header: "Scheduled",
              cell: ({ getValue }) => (
                <span className="text-base leading-snug md:text-sm">
                  {formatLongDisplayDate(getValue())}
                </span>
              ),
              filterFn: "dateWindow",
              sortFn: "datetime",
              meta: {
                width: "14rem",
                nowrap: true,
                description: "Date this payment is due on the schedule.",
              },
            }),
            paymentHistoryHelper.accessor("paymentNumber", {
              header: "No.",
              cell: ({ getValue }) => (
                <span className="font-medium tabular-nums">
                  {Number(getValue())}
                </span>
              ),
              enableSorting: false,
              meta: {
                width: "4.5rem",
                nowrap: true,
                keepOpaque: true,
                label: "No.",
              },
            }),
            paymentHistoryHelper.accessor("description", {
              header: "Description",
              cell: ({ getValue }) => (
                <span className="block text-sm font-medium leading-snug wrap-break-word">
                  {String(getValue())}
                </span>
              ),
              meta: {
                width: "28rem",
                grow: true,
                wrap: true,
                cardTitle: true,
                description:
                  "Bank line when a payment matched, else the lookup.",
              },
            }),
            paymentHistoryHelper.display({
              id: "posted",
              header: "Posted",
              cell: ({ row }) => (
                <span className="text-sm text-[var(--muted-foreground)]">
                  {postedLabel(row.original)}
                </span>
              ),
              enableSorting: false,
              meta: {
                width: "14rem",
                wrap: true,
                description: "Bank post date, or assumed until you confirm.",
              },
            }),
          ]),
        }),
        paymentHistoryHelper.group({
          id: "money",
          header: "Money",
          columns: paymentHistoryHelper.columns([
            paymentHistoryHelper.accessor("paymentAmount", {
              header: "Payment",
              cell: ({ getValue }) => (
                <MoneyText
                  amount={Number(getValue())}
                  currency={currency}
                  tone="neutral"
                />
              ),
              meta: { width: "8rem", nowrap: true },
            }),
            paymentHistoryHelper.accessor("interestPortion", {
              header: "Interest",
              cell: ({ getValue }) => (
                <MoneyText
                  amount={Number(getValue())}
                  currency={currency}
                  tone="cost"
                />
              ),
              meta: { width: "8rem", nowrap: true },
            }),
            paymentHistoryHelper.accessor("principalPortion", {
              header: "Principal",
              cell: ({ getValue }) => (
                <MoneyText
                  amount={Number(getValue())}
                  currency={currency}
                  tone="neutral"
                />
              ),
              meta: { width: "8rem", nowrap: true },
            }),
            paymentHistoryHelper.accessor("balanceAfter", {
              header: "Balance",
              cell: ({ getValue }) => (
                <MoneyText
                  amount={Number(getValue())}
                  currency={currency}
                  tone={balanceTone(Number(getValue()), "liability")}
                />
              ),
              meta: { width: "8.5rem", nowrap: true },
            }),
          ]),
        }),
      ]),
    [busyNumber, currency],
  );

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
      <DataTable
        columns={columns}
        data={rows}
        enableGlobalFilter
        globalFilterFn="fuzzy"
        searchPlaceholder="Search…"
        dateColumnId="scheduledDate"
        csvFilename="loan-payments.csv"
        enableColumnToggle
        initialSorting={[{ id: "scheduledDate", desc: true }]}
        pageSize={25}
      />
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
  const accountClass = accountClassFor(account);
  const currency = account.isoCurrencyCode ?? "CAD";
  const number = formatAccountNumber(account, category);
  const balance = displayBalanceAmount(account.currentBalance, category);
  const balanceClass = moneyToneClass(
    balanceTone(account.currentBalance, accountClass),
  );
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
              <span className={balanceClass}>
                {formatMoney(balance, currency)}
              </span>
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
        {loan ? (
          <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm text-[var(--muted-foreground)]">
                Transaction lookups
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                    aria-label="About transaction lookups"
                  >
                    <Info className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-72">
                  <PopoverHeader>
                    <PopoverTitle>Transaction lookups</PopoverTitle>
                    <PopoverDescription>
                      Phrases from bank lines used to attach PAD payments.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Pick one or more transactions</li>
                      <li>Type a shorter phrase and select it</li>
                      <li>Remove a chip to drop that match</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </div>
            <p className="sr-only">
              Add or remove transaction description phrases that identify this
              loan&apos;s payments.
            </p>
            <LoanTxnDescriptionLookupsField accountId={account.accountId} />
          </div>
        ) : null}
      </div>

      {loan ? (
        <>
          <LoanPaymentTimeline loan={loan} />
          <LoanPaymentHistory
            accountId={account.accountId}
            loan={loan}
            currency={currency}
            transactions={transactions}
          />
        </>
      ) : (
        <AccountPastTransactions
          transactions={transactions}
          currentBalance={account.currentBalance}
          currency={currency}
          accountType={account.type}
          accountClass={accountClass}
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
        <EmptyPrompt
          className="bg-surface-elevated/70 py-6"
          title="No accounts yet"
          description="Upload a bank statement PDF to create accounts and import transactions."
          action={
            <StatementUpload triggerVariant="default" showCsvImport={false} />
          }
        />
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

      {showBudgets ? (
        <>
          <DashboardBudgets />
          <DashboardPings />
        </>
      ) : null}

      <AddLoanDialog open={addLoanOpen} onOpenChange={setAddLoanOpen} />
    </div>
  );
}
