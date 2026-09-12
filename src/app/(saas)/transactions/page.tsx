"use client";

import { fetchDashboard } from "@/domains/dashboard/queries/fetchDashboard";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import {
  DashboardToolbar,
  LoadingSkeleton,
} from "@/domains/dashboard/ui/DashboardPanels";
import { TransactionsDataTable } from "@/domains/transactions/ui/TransactionsDataTable";
import { useQuery } from "@tanstack/react-query";

export default function TransactionsPage() {
  const dashboard = useQuery({
    queryKey: queryKeys.dashboardAll,
    queryFn: () => fetchDashboard({ limit: "all" }),
  });
  const data = dashboard.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-[var(--muted-foreground)]">
            Flat ledger from CSV. Section / Spread / Category are real columns.
            {data
              ? ` Showing ${data.transactions.length} of ${data.transactionCount} stored.`
              : ""}
          </p>
        </div>
        <DashboardToolbar />
      </header>
      {dashboard.isPending && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <TransactionsDataTable
          transactions={data.transactions}
          accounts={data.accounts}
        />
      ) : null}
    </div>
  );
}
