"use client";

import { BankAccountsDashboard } from "@/domains/dashboard/ui/BankAccountsDashboard";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";
import { TitleInfo } from "@/domains/ops/ui/TitleInfo";
import { ClassifyUnclassifiedNudge } from "@/domains/transactions/ui/ClassifyUnclassifiedNudge";
import { TransactionsDataTable } from "@/domains/transactions/ui/TransactionsDataTable";
import {
  formatDisplayDate,
  formatLongDisplayDate,
} from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

function firstNameFrom(fullName: string | null | undefined) {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export default function OverviewPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const firstName = firstNameFrom(me?.name);
  const greeting = firstName ? `Hello, ${firstName}` : "Hello";
  const dashboard = useDashboard();
  const data = dashboard.data;
  const isInitialLoading = dashboard.isPending || (!data && !dashboard.isError);
  const shortDate = isInitialLoading
    ? "\u00a0"
    : formatDisplayDate(data?.latestStatementDate);
  const longDate = isInitialLoading
    ? "\u00a0"
    : formatLongDisplayDate(data?.latestStatementDate);

  return (
    <div className="space-y-8">
      <ClassifyUnclassifiedNudge sure="go-transactions" />
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-6 sm:items-start sm:gap-6">
        <div>
          <TitleInfo
            title="Dashboard"
            lead="See balances across chequing, credit, and loan accounts."
          />
          <p className="sr-only">
            See balances across chequing, credit, and loan accounts.
          </p>
          <p className="type-section mt-1 min-h-7">{greeting}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="type-kicker hidden sm:block">Latest statement</p>
          <p className="whitespace-nowrap text-sm font-medium text-muted-foreground sm:hidden">
            {shortDate}
          </p>
          <p className="type-section mt-1 hidden min-h-7 sm:block">
            {longDate}
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
            showBudgets
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
