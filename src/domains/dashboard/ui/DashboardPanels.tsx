"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useMemo } from "react";
import { formatMoney, formatLedgerSpend } from "@/domains/dashboard/domain/money";
import type {
  DashboardAccount,
  DashboardData,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { StatementUpload } from "@/domains/statements/ui/StatementUpload";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { formatDisplayDate } from "@/shared/lib/format-date";

export function useDashboard(transactionLimit: number | null = 250) {
  const { isAuthenticated } = useConvexAuth();
  const privateLedger = usePrivateLedger();
  const result = useQuery(
    api.dashboard.get,
    isAuthenticated && !privateLedger.encryptedLedger
      ? { transactionLimit }
      : "skip",
  );

  const encryptedData = useMemo(() => {
    if (!privateLedger.encryptedLedger || !privateLedger.unlocked) return undefined;
    const data = dashboardFromPrivateLedger(privateLedger.ledger);
    if (transactionLimit == null) return data;
    return {
      ...data,
      transactions: data.transactions.slice(0, transactionLimit),
      hasMoreTransactions: data.transactions.length > transactionLimit,
    };
  }, [privateLedger.encryptedLedger, privateLedger.ledger, privateLedger.unlocked, transactionLimit]);

  if (privateLedger.encryptedLedger) {
    const locked = !privateLedger.vaultReady || !privateLedger.unlocked;
    return {
      data: locked ? undefined : encryptedData,
      error: privateLedger.error ? new Error(privateLedger.error) : null,
      isPending: privateLedger.loading,
      isError: Boolean(privateLedger.error),
      isSuccess: Boolean(encryptedData) && !locked,
      encryptedLedger: true as const,
      locked,
      reload: privateLedger.reload,
    };
  }

  return {
    data: result?.ok ? result.data : undefined,
    error: result && !result.ok ? new Error(result.error) : null,
    isPending: isAuthenticated && result === undefined,
    isError: Boolean(result && !result.ok),
    isSuccess: Boolean(result?.ok),
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
      <StatBadge
        label="Total balance"
        value={formatMoney(data.totalBalance)}
      />
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
        <EmptyState text="No accounts yet. Upload a statement PDF to get started." />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
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
        <EmptyState text="No transactions yet. Upload a statement PDF to import them." />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {transactions.map((txn) => {
            const isSpend = txn.amount > 0;
            const place = [txn.locationCity, txn.locationRegion]
              .filter(Boolean)
              .join(", ");
            return (
              <li
                key={txn.transactionId}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {txn.merchantClean ?? txn.merchantName ?? txn.name}
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
                      ? ` · ${[txn.sectionName, txn.categoryName, txn.subcategoryName]
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
                <p
                  className={`shrink-0 font-mono text-sm ${
                    isSpend ? "text-[var(--spend)]" : "text-[var(--income)]"
                  }`}
                >
                  {formatLedgerSpend(
                    txn.amount,
                    txn.isoCurrencyCode ?? "CAD",
                  )}
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-semibold tracking-tight text-[var(--foreground)]">
        {value}
      </span>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/70 px-4 py-8 text-sm text-[var(--muted-foreground)]">
      {text}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-48 animate-pulse rounded-xl bg-[var(--surface-2)]" />
    </div>
  );
}

export function OverviewBadgesSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="h-7 w-28 animate-pulse rounded-full bg-[var(--surface-2)]"
        />
      ))}
    </div>
  );
}
