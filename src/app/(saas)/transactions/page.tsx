"use client";

import {
  DashboardToolbar,
  LoadingSkeleton,
  useDashboard,
} from "@/domains/dashboard/ui/DashboardPanels";
import { TransactionsDataTable } from "@/domains/transactions/ui/TransactionsDataTable";

export default function TransactionsPage() {
  const dashboard = useDashboard();
  const data = dashboard.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-[var(--muted-foreground)]">
            Search, sort, and page enriched ledger rows.
            {data ? ` ${data.transactionCount} stored.` : ""}
          </p>
        </div>
        <DashboardToolbar />
      </header>
      {dashboard.isPending && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <TransactionsDataTable transactions={data.transactions} />
      ) : null}
    </div>
  );
}
