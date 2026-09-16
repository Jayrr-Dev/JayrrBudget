"use client";

import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { PageSpinner } from "@/components/ui/spinner";
import {
  formatLedgerSpend,
  formatMoney,
} from "@/domains/dashboard/domain/money";
import type {
  DashboardAccount,
  DashboardData,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import {
  peekDashboard,
  rememberDashboard,
} from "@/domains/dashboard/ui/ledgerQuerySnapshot";
import { useFeatureFlags } from "@/domains/feature-flags/ui/useFeatureFlag";
import { MerchantLabel } from "@/domains/merchants/ui/MerchantLabel";
import { StatementUpload } from "@/domains/statements/ui/StatementUpload";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { formatDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";

export function useDashboard(transactionLimit: number | null = 250) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const flags = useFeatureFlags();
  const privateLedger = usePrivateLedger();
  const result = useQuery(
    api.dashboard.get,
    isAuthenticated && !flags.loading && !privateLedger.encryptedLedger
      ? { transactionLimit }
      : "skip",
  );

  const encryptedData = useMemo(() => {
    if (!privateLedger.encryptedLedger || !privateLedger.unlocked)
      return undefined;
    const data = dashboardFromPrivateLedger(privateLedger.ledger);
    if (transactionLimit == null) return data;
    return {
      ...data,
      transactions: data.transactions.slice(0, transactionLimit),
      hasMoreTransactions: data.transactions.length > transactionLimit,
    };
  }, [
    privateLedger.encryptedLedger,
    privateLedger.ledger,
    privateLedger.unlocked,
    transactionLimit,
  ]);

  if (authLoading || flags.loading) {
    const cached = privateLedger.encryptedLedger
      ? undefined
      : peekDashboard(transactionLimit);
    return {
      data: cached,
      error: null,
      isPending: cached === undefined,
      isError: false,
      isSuccess: Boolean(cached),
      encryptedLedger: privateLedger.encryptedLedger,
      locked: false,
      reload: privateLedger.reload,
    };
  }

  if (privateLedger.encryptedLedger) {
    const locked = !privateLedger.vaultReady || !privateLedger.unlocked;
    const pending = privateLedger.loading || locked;
    return {
      data: locked || privateLedger.loading ? undefined : encryptedData,
      error: privateLedger.error ? new Error(privateLedger.error) : null,
      isPending: pending,
      isError: Boolean(privateLedger.error),
      isSuccess: Boolean(encryptedData) && !locked && !pending,
      encryptedLedger: true as const,
      locked,
      reload: privateLedger.reload,
    };
  }

  const live = result?.ok ? result.data : undefined;
  if (live) rememberDashboard(transactionLimit, live);
  const cached =
    live ??
    (result === undefined ? peekDashboard(transactionLimit) : undefined);

  return {
    data: cached,
    error: result && !result.ok ? new Error(result.error) : null,
    isPending: isAuthenticated && result === undefined && cached === undefined,
    isError: Boolean(result && !result.ok),
    isSuccess: Boolean(live ?? cached),
    encryptedLedger: false as const,
    locked: false,
    reload: undefined as undefined | (() => void),
  };
}

export function DashboardToolbar({
  onImported,
}: {
  onImported?: () => Promise<void> | void;
} = {}) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <StatementUpload
        onImported={async () => {
          await onImported?.();
        }}
      />
    </div>
  );
}

export function OverviewPanel({ data }: { data: DashboardData }) {
  return (
    <section className="flex flex-wrap gap-2">
      <StatBadge
        label="Institutions"
        value={String(data.institutions.length)}
      />
      <StatBadge label="Total balance" value={formatMoney(data.totalBalance)} />
      <StatBadge
        label="Latest statement"
        value={formatDisplayDate(data.latestStatementDate)}
      />
    </section>
  );
}

export function AccountsPanel({
  accounts,
  compact = false,
}: {
  accounts: DashboardAccount[];
  compact?: boolean;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">
        {compact ? "Accounts" : "All accounts"}
      </h2>
      {accounts.length === 0 ? (
        <EmptyPrompt
          className="bg-surface-elevated/70 py-8"
          title="No accounts yet"
          description="Upload a statement PDF to get started."
          action={<StatementUpload />}
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
          {accounts.map((account) => (
            <li
              key={account.accountId}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {account.name}
                  {account.mask ? (
                    <span className="text-[var(--muted-foreground)]">
                      {" "}
                      ••{account.mask}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {[account.type, account.subtype].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="font-mono text-sm">
                {formatMoney(
                  account.currentBalance,
                  account.isoCurrencyCode ?? "CAD",
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TransactionsList({
  transactions,
  compact = false,
  totalCount,
}: {
  transactions: DashboardTransaction[];
  compact?: boolean;
  totalCount?: number;
}) {
  return (
    <section className="space-y-4 pb-4">
      <h2 className="text-xl font-semibold tracking-tight">
        {compact
          ? "Recent transactions"
          : totalCount
            ? `Transactions (${transactions.length} of ${totalCount})`
            : "Transactions"}
      </h2>
      {transactions.length === 0 ? (
        <EmptyPrompt
          className="bg-surface-elevated/70 py-8"
          title="No transactions yet"
          description="Upload a statement PDF to import them."
          action={<StatementUpload />}
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
          {transactions.map((txn) => {
            const place = [txn.locationCity, txn.locationRegion]
              .filter(Boolean)
              .join(", ");
            return (
              <li
                key={txn.transactionId}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="min-w-0">
                    <MerchantLabel
                      name={
                        txn.merchantClean ?? txn.merchantName ?? txn.name
                      }
                      src={txn.logoUrl}
                      className="font-medium"
                    />
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {formatDisplayDate(txn.date)}
                    {txn.authorizedDate && txn.authorizedDate !== txn.date
                      ? ` (auth ${formatDisplayDate(txn.authorizedDate)})`
                      : ""}
                    {txn.companyName ? ` · ${txn.companyName}` : ""}
                    {txn.brandName && txn.brandName !== txn.companyName
                      ? ` · ${txn.brandName}`
                      : ""}
                    {txn.sectionName || txn.categoryName || txn.subcategoryName
                      ? ` · ${[
                          txn.sectionName,
                          txn.categoryName,
                          txn.subcategoryName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}`
                      : ""}
                    {txn.transactionCode ? ` · ${txn.transactionCode}` : ""}
                    {txn.paymentChannel ? ` · ${txn.paymentChannel}` : ""}
                    {place ? ` · ${place}` : ""}
                    {txn.source === "statement" ? " · statement" : ""}
                    {txn.pending ? " · pending" : ""}
                  </p>
                  {!compact && txn.originalDescription ? (
                    <p className="mt-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
                      {txn.originalDescription}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-mono text-sm text-foreground">
                  {formatLedgerSpend(txn.amount, txn.isoCurrencyCode ?? "CAD")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-surface-elevated px-2.5 py-1 text-xs">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-semibold tracking-tight text-[var(--foreground)]">
        {value}
      </span>
    </span>
  );
}

export function OverviewBadgesSkeleton() {
  return <PageSpinner className="min-h-16 py-8" />;
}
