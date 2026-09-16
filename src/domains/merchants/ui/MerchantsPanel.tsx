"use client";

import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { PageSpinner } from "@/components/ui/spinner";
import { DecryptingPage } from "@/domains/vault/ui/DecryptingStatus";
import {
  peekMerchants,
  rememberMerchants,
} from "@/domains/dashboard/ui/ledgerQuerySnapshot";
import { EditMerchantDialog } from "@/domains/merchants/ui/EditMerchantDialog";
import { MerchantLabel } from "@/domains/merchants/ui/MerchantLabel";
import {
  MERCHANT_TXN_PEEK_LIMIT,
  MerchantTxnsPopover,
  type MerchantTxnPeek,
} from "@/domains/merchants/ui/MerchantTxnsPopover";
import type { PrivateTransaction } from "@/domains/vault/domain/privateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { Icon } from "@iconify/react";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

const MERCHANT_TXN_COUNT_KEY = "jayrr-budget.merchant-txn-counts-v1";

type MerchantRow = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  logoSrc?: string | null;
  transactionCount: number;
  createdAt: number;
  updatedAt: number;
};

const HIDDEN_COLUMNS = {
  slug: false,
};

const columnHelper = createColumnHelper<DataTableFeatures, MerchantRow>();

function cellText(value: string | null | undefined, className = "text-sm") {
  if (value == null || value === "") {
    return <span className="text-sm text-[var(--muted-foreground)]">-</span>;
  }
  return (
    <span className={`block truncate ${className}`} title={value}>
      {value}
    </span>
  );
}

function formatWhen(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function actionsHeader() {
  return (
    <span className="flex items-center justify-center">
      <Icon
        icon="mynaui:mouse-pointer-click-solid"
        className="size-4 text-[var(--muted-foreground)]"
        aria-hidden
      />
      <span className="sr-only">Actions</span>
    </span>
  );
}

function vaultPeeksByMerchantName(txns: PrivateTransaction[]) {
  const byName = new Map<string, MerchantTxnPeek[]>();
  for (const tx of txns) {
    const name = tx.merchantClean ?? tx.merchantName ?? tx.description;
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      currency: tx.currency,
    });
    byName.set(name, list);
  }
  for (const [name, list] of byName) {
    list.sort((left, right) => right.date.localeCompare(left.date));
    byName.set(name, list.slice(0, MERCHANT_TXN_PEEK_LIMIT));
  }
  return byName;
}

function MerchantsTable({
  rows,
  vaultPeeksByName,
}: {
  rows: MerchantRow[];
  vaultPeeksByName?: Map<string, MerchantTxnPeek[]>;
}) {
  const [editing, setEditing] = useState<MerchantRow | null>(null);
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "actions",
          header: () => actionsHeader(),
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  aria-label={`Actions for ${row.original.name}`}
                >
                  <Icon icon="basil:menu-outline" className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-auto min-w-36">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setEditing(row.original)}
                  >
                    Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
          meta: { label: "Actions", width: "2.5rem" },
        }),
        columnHelper.accessor("name", {
          header: "Merchant",
          cell: ({ row, getValue }) => (
            <MerchantLabel
              name={getValue()}
              src={row.original.logoSrc ?? row.original.logoUrl}
              className="text-sm font-medium"
            />
          ),
          filterFn: "includesString",
          sortFn: "text",
          meta: { width: "18rem", nowrap: true, grow: true },
        }),
        columnHelper.accessor("transactionCount", {
          header: "Txns",
          cell: ({ getValue }) => (
            <span className="text-sm tabular-nums">
              {(getValue() ?? 0).toLocaleString()}
            </span>
          ),
          sortFn: "basic",
          meta: { width: "5.5rem", nowrap: true },
        }),
        columnHelper.accessor("updatedAt", {
          header: "Updated",
          cell: ({ getValue }) => cellText(formatWhen(getValue())),
          sortFn: "basic",
          meta: { width: "8.5rem", nowrap: true },
        }),
        columnHelper.accessor("slug", {
          header: "Slug",
          cell: ({ getValue }) =>
            cellText(
              getValue(),
              "font-mono text-xs text-[var(--muted-foreground)]",
            ),
          filterFn: "includesString",
          sortFn: "text",
          meta: { width: "14rem", nowrap: true },
        }),
        columnHelper.display({
          id: "txnsInfo",
          header: () => <span className="sr-only">Transactions</span>,
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <MerchantTxnsPopover
                merchantId={row.original.id}
                merchantName={row.original.name}
                vaultPeeks={
                  vaultPeeksByName
                    ? (vaultPeeksByName.get(row.original.name) ?? [])
                    : undefined
                }
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
          meta: { label: "Transactions", width: "2.5rem" },
        }),
      ]),
    [vaultPeeksByName],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        enableGlobalFilter
        globalFilterFn="fuzzy"
        searchPlaceholder="Filter merchants…"
        pageSize={25}
        enableColumnToggle
        csvFilename="merchants.csv"
        fillWidth
        initialColumnVisibility={HIDDEN_COLUMNS}
      />
      <EditMerchantDialog
        merchant={editing}
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

export function MerchantsPanel() {
  const privateLedger = usePrivateLedger();
  const syncMerchantTxnCounts = useMutation(
    api.merchants.syncTransactionCounts,
  );
  const merchants = useQuery(
    api.merchants.list,
    privateLedger.encryptedLedger ? "skip" : {},
  );

  useEffect(() => {
    if (privateLedger.encryptedLedger) return;
    let cancelled = false;
    void (async () => {
      let alreadyCounted = false;
      let cursor: string | null = null;
      try {
        const stored = localStorage.getItem(MERCHANT_TXN_COUNT_KEY);
        alreadyCounted = stored === "done";
        if (!alreadyCounted && stored) cursor = stored;
      } catch {
        // ignore
      }
      if (alreadyCounted) return;
      try {
        for (let i = 0; i < 40; i += 1) {
          if (cancelled) return;
          const result = await syncMerchantTxnCounts({
            limit: 40,
            cursor,
          });
          cursor = result.continueCursor;
          try {
            localStorage.setItem(
              MERCHANT_TXN_COUNT_KEY,
              result.isDone ? "done" : (result.continueCursor ?? ""),
            );
          } catch {
            // ignore
          }
          if (result.isDone) break;
        }
      } catch (error) {
        console.warn("[merchants] txn count sync failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [privateLedger.encryptedLedger, syncMerchantTxnCounts]);

  const encryptedRows = useMemo(() => {
    if (!privateLedger.encryptedLedger || !privateLedger.unlocked)
      return [] as MerchantRow[];
    const counts = new Map<string, number>();
    for (const tx of privateLedger.ledger.transactions) {
      const name = tx.merchantClean ?? tx.merchantName ?? tx.description;
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const fromRecords = privateLedger.ledger.merchants.map((merchant) => ({
      id: merchant.recordId,
      slug: merchant.merchantId,
      name: merchant.name,
      logoUrl: merchant.logoUrl ?? null,
      logoSrc: merchant.logoUrl ?? null,
      transactionCount: counts.get(merchant.name) ?? 0,
      createdAt: merchant.createdAt ?? 0,
      updatedAt: merchant.updatedAt ?? merchant.createdAt ?? 0,
    }));
    if (fromRecords.length) return fromRecords;
    const names = new Map<string, MerchantRow>();
    for (const [name, transactionCount] of counts) {
      names.set(name, {
        id: name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        logoUrl: null,
        logoSrc: null,
        transactionCount,
        createdAt: 0,
        updatedAt: 0,
      });
    }
    return [...names.values()];
  }, [
    privateLedger.encryptedLedger,
    privateLedger.ledger,
    privateLedger.unlocked,
  ]);

  const encryptedPeeksByName = useMemo(() => {
    if (!privateLedger.encryptedLedger || !privateLedger.unlocked) {
      return undefined;
    }
    return vaultPeeksByMerchantName(privateLedger.ledger.transactions);
  }, [
    privateLedger.encryptedLedger,
    privateLedger.ledger.transactions,
    privateLedger.unlocked,
  ]);

  if (privateLedger.encryptedLedger) {
    if (privateLedger.loading || !privateLedger.unlocked) {
      return <DecryptingPage />;
    }
    if (encryptedRows.length === 0) {
      return (
        <EmptyPrompt
          className="py-10"
          title="No merchants yet"
          description="They appear after ledger rows have merchant labels."
          href="/statements"
          actionLabel="Upload statement"
        />
      );
    }
    return (
      <MerchantsTable
        rows={encryptedRows}
        vaultPeeksByName={encryptedPeeksByName}
      />
    );
  }

  if (merchants !== undefined) {
    rememberMerchants(merchants as MerchantRow[]);
  }
  const merchantRows = merchants ?? peekMerchants<MerchantRow>();

  if (merchantRows === undefined) {
    return <PageSpinner />;
  }

  if (merchantRows.length === 0) {
    return (
      <EmptyPrompt
        className="py-10"
        title="No merchants yet"
        description="They appear after ledger rows have merchant labels."
        href="/statements"
        actionLabel="Upload statement"
      />
    );
  }

  return <MerchantsTable rows={merchantRows} />;
}
