"use client";

import { BankAccountsDashboard } from "@/domains/dashboard/ui/BankAccountsDashboard";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";
import { TransactionsDataTable } from "@/domains/transactions/ui/TransactionsDataTable";
import { formatDisplayDate } from "@/shared/lib/format-date";

export default function OverviewPage() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const isInitialLoading = dashboard.isPending || (!data && !dashboard.isError);

  return (
    <div className="space-y-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6 border-b border-[var(--border)] pb-6">
        <div className="space-y-2">
          <p className="type-kicker">Accounts</p>
          <h1 className="type-page">Dashboard</h1>
          <p className="type-lead max-w-xl">
            See balances across chequing, credit, and loan accounts.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="type-kicker">Latest statement</p>
          <p className="type-section mt-1 min-h-7">
            {isInitialLoading
              ? "\u00a0"
              : formatDisplayDate(data?.latestStatementDate)}
          </p>
        </div>
      </header>

      {dashboard.isError && !dashboard.locked ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dashboard.error?.message ?? "Dashboard failed"}
        </div>
      ) : null}

      {dashboard.isError && !dashboard.locked && !data ? null : (
        <div className="space-y-8">
          <BankAccountsDashboard
            accounts={data?.accounts ?? []}
            transactions={data?.transactions}
            loading={isInitialLoading}
          />
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Transaction history
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Search, sort, and filter ledger rows.
                {data?.hasMoreTransactions
                  ? ` Showing latest ${data.transactions.length}.`
                  : data?.transactionCount
                    ? ` ${data.transactionCount} stored.`
                    : ""}
              </p>
            </div>
            <TransactionsDataTable
              transactions={data?.transactions ?? []}
              loading={isInitialLoading}
            />
          </section>
        </div>
      )}
    </div>
  );
}
