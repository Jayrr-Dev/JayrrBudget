"use client";

import {
  BankAccountsDashboard,
  BankAccountsLoadingSkeleton,
} from "@/domains/dashboard/ui/BankAccountsDashboard";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AccountsContent() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const searchParams = useSearchParams();
  const selectedAccountId = searchParams.get("account");

  if (selectedAccountId) {
    if (dashboard.isPending && !data) {
      return <BankAccountsLoadingSkeleton />;
    }
    if (dashboard.locked) return <BankAccountsLoadingSkeleton />;
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
        <h1 className="type-page">Accounts</h1>
        <p className="type-lead">
          Open an account to see its balance and recent activity.
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
          <header className="space-y-2 border-b border-[var(--border)] pb-6">
            <h1 className="type-page">Accounts</h1>
            <p className="type-lead">
              Open an account to see its balance and recent activity.
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
