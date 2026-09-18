"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DashboardToolbar,
  useDashboard,
} from "@/domains/dashboard/ui/DashboardPanels";
import { TransactionsDataTable } from "@/domains/transactions/ui/TransactionsDataTable";
import { Info } from "lucide-react";

function TransactionsTitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
          aria-label="About transactions"
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
          <PopoverTitle>Transactions</PopoverTitle>
          <PopoverDescription>
            Browse purchases and deposits from your ledger.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Bank details on the left; category and labels on the right</li>
            <li>Search, month, and date range filter the list</li>
            <li>Upload a statement or CSV to add rows</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export default function TransactionsPage() {
  const dashboard = useDashboard(null);
  const data = dashboard.data;

  const countHint = data
    ? data.hasMoreTransactions
      ? `Showing latest ${data.transactions.length}.`
      : `Showing ${data.transactions.length} of ${data.transactionCount}.`
    : "";

  return (
    <div className="space-y-4 sm:space-y-8">
      <header className="flex flex-nowrap items-center justify-between gap-2 border-b border-border pb-4 sm:gap-4 sm:pb-6">
        <div className="min-w-0">
          <h1 className="type-kicker flex items-center gap-2 text-[20px] whitespace-nowrap">
            Transactions
            <TransactionsTitleInfo />
          </h1>
          <p className="sr-only">
            Browse purchases and deposits. Bank details on the left; category
            and labels on the right.
            {countHint ? ` ${countHint}` : ""}
          </p>
        </div>
        <DashboardToolbar onImported={() => dashboard.reload?.()} />
      </header>
      <TransactionsDataTable
        transactions={data?.transactions ?? []}
        accounts={data?.accounts}
        loading={dashboard.isPending && !data}
      />
    </div>
  );
}
