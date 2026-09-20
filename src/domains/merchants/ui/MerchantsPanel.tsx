"use client";

import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { PageSpinner } from "@/components/ui/spinner";
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
import { DecryptingPage } from "@/domains/vault/ui/DecryptingStatus";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { Icon } from "@iconify/react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

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
          header: () => (
            <span className="flex items-center justify-center">
              <Icon
                icon="mynaui:mouse-pointer-click-solid"
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden
              />
              <span className="sr-only">Actions</span>
            </span>
          ),
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActionsMenu
                label={row.original.name}
                size="sm"
                actions={[
                  {
                    label: "Edit",
                    onSelect: () => setEditing(row.original),
                  },
                ]}
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
          meta: { label: "Actions", width: "2.5rem" },
        }),
        columnHelper.group({
          id: "main",
          header: "Main",
          columns: columnHelper.columns([
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
              meta: {
                width: "18rem",
                nowrap: true,
                grow: true,
                cardTitle: true,
              },
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
          ]),
        }),
        columnHelper.display({
          id: "txnsInfo",
          header: () => <span className="sr-only">Transactions</span>,
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              {row.original.transactionCount > 0 ? (
                <MerchantTxnsPopover
                  merchantId={row.original.id}
                  merchantName={row.original.name}
                  vaultPeeks={
                    vaultPeeksByName
                      ? (vaultPeeksByName.get(row.original.name) ?? [])
                      : undefined
                  }
                />
              ) : (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              )}
            </div>
          ),
          enableSorting: false,
          enableHiding: false,
          meta: {
            label: "Transactions",
            width: "2.5rem",
            cardTitleAside: true,
          },
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
  const merchants = useQuery(
    api.merchants.list,
    privateLedger.encryptedLedger ? "skip" : {},
  );
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
