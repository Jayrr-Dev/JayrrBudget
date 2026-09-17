"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BankAccountsDashboard } from "@/domains/dashboard/ui/BankAccountsDashboard";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";
import { Info } from "lucide-react";
import { useSearchParams } from "next/navigation";

function AccountsTitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="About accounts"
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
          <PopoverTitle>Accounts</PopoverTitle>
          <PopoverDescription>
            Open an account to see its balance and recent activity.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export function AccountsView() {
  const searchParams = useSearchParams();
  const selectedAccountId = searchParams.get("account");
  const dashboard = useDashboard();
  const data = dashboard.data;

  if (selectedAccountId) {
    if (dashboard.locked || (dashboard.isPending && !data)) {
      return (
        <BankAccountsDashboard
          accounts={[]}
          loading
          selectedAccountId={selectedAccountId}
        />
      );
    }
    if (!data) return null;
    return (
      <BankAccountsDashboard
        accounts={data.accounts}
        transactions={data.transactions}
        selectedAccountId={selectedAccountId}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-[var(--border)] pb-6">
        <h1 className="type-page flex items-center gap-2">
          Accounts
          <AccountsTitleInfo />
        </h1>
        <p className="sr-only">
          Open an account to see its balance and recent activity.
        </p>
      </header>
      {dashboard.isPending && !data ? (
        <BankAccountsDashboard accounts={[]} loading />
      ) : data ? (
        <BankAccountsDashboard
          accounts={data.accounts}
          transactions={data.transactions}
        />
      ) : null}
    </div>
  );
}
