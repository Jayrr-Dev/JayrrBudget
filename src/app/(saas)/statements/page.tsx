"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  DashboardToolbar,
  LoadingSkeleton,
  OverviewPanel,
  useDashboard,
} from "@/domains/dashboard/ui/DashboardPanels";
import { StatementUploadLogs } from "@/domains/statements/ui/StatementUploadLogs";
import { statementQueryKeys } from "@/domains/statements/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";

export default function StatementsPage() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const isInitialLoading = dashboard.isPending && !data;
  const queryClient = useQueryClient();

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
            Overview
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="max-w-xl text-[var(--muted-foreground)]">
            Import statement PDFs, enrich merchants, mine spend.
          </p>
        </div>
        <DashboardToolbar
          onImported={async () => {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: queryKeys.dashboard,
              }),
              queryClient.invalidateQueries({
                queryKey: statementQueryKeys.uploads,
              }),
            ]);
          }}
        />
      </header>

      {dashboard.isError ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dashboard.error?.message ?? "Dashboard failed"}
        </div>
      ) : null}

      {isInitialLoading ? (
        <LoadingSkeleton />
      ) : data ? (
        <OverviewPanel data={data} />
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Parse logs</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Past PDF imports — status, counts, and OCR text.
          </p>
        </div>
        <StatementUploadLogs />
      </section>
    </div>
  );
}
