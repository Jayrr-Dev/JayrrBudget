"use client";

import { Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DashboardToolbar,
  OverviewBadgesSkeleton,
  OverviewPanel,
  useDashboard,
} from "@/domains/dashboard/ui/DashboardPanels";
import { StatementUploadLogs } from "@/domains/statements/ui/StatementUploadLogs";
import { statementQueryKeys } from "@/domains/statements/queries/query-keys";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

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
            Statements
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Statement imports
          </h1>
          <p className="max-w-xl text-[var(--muted-foreground)]">
            Upload bank PDFs, set upload rules, and check what got imported.
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
              queryClient.invalidateQueries({
                queryKey: analysisQueryKeys.all,
              }),
            ]);
          }}
        />
      </header>

      {dashboard.isError && !dashboard.locked ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dashboard.error?.message ?? "Dashboard failed"}
        </div>
      ) : null}

      {isInitialLoading ? (
        <OverviewBadgesSkeleton />
      ) : data ? (
        <OverviewPanel data={data} />
      ) : null}

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          Parse logs
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="About parse logs"
              >
                <Info className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-80 gap-0 p-3.5"
            >
              <PopoverHeader className="gap-1.5">
                <PopoverTitle>Parse logs</PopoverTitle>
                <PopoverDescription className="leading-relaxed">
                  Past PDF imports: status, counts, and OCR text.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </h2>
        <StatementUploadLogs />
      </section>
    </div>
  );
}
