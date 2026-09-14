"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { formatMoney, formatLedgerSpend } from "@/domains/dashboard/domain/money";
import type {
  DashboardAccount,
  DashboardData,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { StatementUpload } from "@/domains/statements/ui/StatementUpload";
import { formatDisplayDate } from "@/shared/lib/format-date";

export function useDashboard(transactionLimit: number | null = 250) {
  const result = useQuery(api.dashboard.get, { transactionLimit });
  return {
    data: result?.ok ? result.data : undefined,
    error: result && !result.ok ? new Error(result.error) : null,
    isPending: result === undefined,
    isError: Boolean(result && !result.ok),
    isSuccess: Boolean(result?.ok),
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
      <Button
        variant="outline"
        render={<Link href="/canvas" />}
      >
        Open canvas
      </Button>
    </div>
  );
}

export function OverviewPanel({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Institutions"
          value={String(data.institutions.length)}
        />
        <Stat label="Accounts" value={String(data.accounts.length)} />
        <Stat
          label="Total balance"
          value={formatMoney(data.totalBalance)}
        />
        <Stat
          label="Transactions stored"
          value={String(data.transactionCount)}
        />
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <Stat label="Earliest txn" value={formatDisplayDate(data.earliestDate)} />
        <Stat label="Latest txn" value={formatDisplayDate(data.latestDate)} />
      </section>
      <AccountsPanel accounts={data.accounts.slice(0, 5)} compact />
      <TransactionsList
        transactions={data.transactions.slice(0, 8)}
        compact
        totalCount={data.transactionCount}
      />
    </div>
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
                  account.isoCurrencyCode ?? "USD",
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
                      : txn.categoryDetailed
                        ? ` · ${txn.categoryDetailed.replaceAll("_", " ").toLowerCase()}`
                        : txn.categoryPrimary
                          ? ` · ${txn.categoryPrimary.replaceAll("_", " ").toLowerCase()}`
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
                    txn.isoCurrencyCode ?? "USD",
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-5">
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
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
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="h-24 animate-pulse rounded-xl bg-[var(--surface-2)]"
          />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-[var(--surface-2)]" />
    </div>
  );
}
