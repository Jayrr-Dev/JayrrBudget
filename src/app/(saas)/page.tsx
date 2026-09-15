"use client";

import {
  BankAccountsDashboard,
  BankAccountsLoadingSkeleton,
} from "@/domains/dashboard/ui/BankAccountsDashboard";
import {
  LoadingSkeleton,
  useDashboard,
} from "@/domains/dashboard/ui/DashboardPanels";
import { TransactionsDataTable } from "@/domains/transactions/ui/TransactionsDataTable";
import { formatDisplayDate } from "@/shared/lib/format-date";

export default function OverviewPage() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const isInitialLoading = dashboard.isPending && !data;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-6 border-b border-[var(--border)] pb-6">
        <div className="space-y-1">
          <p className="text-sm tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
            Accounts
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="max-w-xl text-[var(--muted-foreground)]">
            See balances across chequing, credit, and loan accounts.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
            Latest statement
          </p>
          <p className="mt-1 text-lg font-medium tracking-tight">
            {formatDisplayDate(data?.latestStatementDate)}
          </p>
        </div>
      </header>

      {dashboard.isError && !dashboard.locked ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dashboard.error?.message ?? "Dashboard failed"}
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="space-y-10">
          <BankAccountsLoadingSkeleton />
          <LoadingSkeleton />
        </div>
      ) : data ? (
        <div className="space-y-10">
          <BankAccountsDashboard
            accounts={data.accounts}
            transactions={data.transactions}
          />
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Transaction history
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Search, sort, and filter ledger rows.
                {data.hasMoreTransactions
                  ? ` Showing latest ${data.transactions.length}.`
                  : data.transactionCount
                    ? ` ${data.transactionCount} stored.`
                    : ""}
              </p>
            </div>
            <TransactionsDataTable transactions={data.transactions} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
