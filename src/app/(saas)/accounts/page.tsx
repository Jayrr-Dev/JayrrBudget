"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BankAccountsDashboard,
  BankAccountsLoadingSkeleton,
} from "@/domains/dashboard/ui/BankAccountsDashboard";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";

function AccountsContent() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const searchParams = useSearchParams();
  const selectedAccountId = searchParams.get("account");

  if (selectedAccountId) {
    if (dashboard.isPending && !data) {
      return <BankAccountsLoadingSkeleton />;
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
      <header className="space-y-1 border-b border-[var(--border)] pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-[var(--muted-foreground)]">
          Balances from linked banks and uploaded statements.
        </p>
      </header>
      {dashboard.isPending && !data ? (
        <BankAccountsLoadingSkeleton />
      ) : data ? (
        <BankAccountsDashboard
          accounts={data.accounts}
          transactions={data.transactions}
        />
      ) : null}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <header className="space-y-1 border-b border-[var(--border)] pb-6">
            <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
            <p className="text-[var(--muted-foreground)]">
              Balances from linked banks and uploaded statements.
            </p>
          </header>
          <BankAccountsLoadingSkeleton />
        </div>
      }
    >
      <AccountsContent />
    </Suspense>
  );
}
