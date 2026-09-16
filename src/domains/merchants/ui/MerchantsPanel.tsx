"use client";

import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageSpinner } from "@/components/ui/spinner";
import { EditMerchantDialog } from "@/domains/merchants/ui/EditMerchantDialog";
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
  company: string | null;
  brand: string | null;
  website: string | null;
  logoUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

const HIDDEN_COLUMNS = {
  slug: false,
  company: false,
  brand: false,
  website: false,
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

function MerchantsTable({
  rows,
  canEdit,
}: {
  rows: MerchantRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<MerchantRow | null>(null);
  const columns = useMemo(() => {
    const rest = [
      columnHelper.accessor("name", {
        header: "Merchant",
        cell: ({ getValue }) => cellText(getValue(), "text-sm font-medium"),
        filterFn: "includesString",
        sortFn: "text",
        meta: { width: "18rem", nowrap: true, grow: true },
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
      columnHelper.accessor("company", {
        header: "Company",
        cell: ({ getValue }) => cellText(getValue()),
        filterFn: "equalsString",
        sortFn: "text",
        meta: { width: "14rem", nowrap: true },
      }),
      columnHelper.accessor("brand", {
        header: "Brand",
        cell: ({ getValue }) => cellText(getValue()),
        filterFn: "fuzzy",
        sortFn: "text",
        meta: { width: "12rem", nowrap: true },
      }),
      columnHelper.accessor("website", {
        header: "Website",
        cell: ({ getValue }) => cellText(getValue()),
        filterFn: "includesString",
        sortFn: "text",
        meta: { width: "16rem", nowrap: true },
      }),
    ];
    if (!canEdit) {
      return columnHelper.columns(rest);
    }
    return columnHelper.columns([
      columnHelper.display({
        id: "actions",
        header: actionsHeader,
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
        enableHiding: true,
        meta: { label: "Actions", width: "2rem" },
      }),
      ...rest,
    ]);
  }, [canEdit]);

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
      {canEdit ? (
        <EditMerchantDialog
          merchant={editing}
          open={editing != null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}
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
    const fromRecords = privateLedger.ledger.merchants.map((merchant) => ({
      id: merchant.recordId,
      slug: merchant.merchantId,
      name: merchant.name,
      company: merchant.company ?? null,
      brand: merchant.brand ?? null,
      website: merchant.website ?? null,
      logoUrl: null as string | null,
      createdAt: merchant.createdAt ?? 0,
      updatedAt: merchant.updatedAt ?? merchant.createdAt ?? 0,
    }));
    if (fromRecords.length) return fromRecords;
    const names = new Map<string, MerchantRow>();
    for (const tx of privateLedger.ledger.transactions) {
      const name = tx.merchantClean ?? tx.merchantName ?? tx.description;
      if (!name || names.has(name)) continue;
      names.set(name, {
        id: name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        company: null,
        brand: null,
        website: null,
        logoUrl: null,
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

  if (privateLedger.encryptedLedger) {
    if (privateLedger.loading || !privateLedger.unlocked) {
      return <PageSpinner />;
    }
    if (encryptedRows.length === 0) {
      return (
        <p className="text-sm text-[var(--muted-foreground)]">
          No merchants yet.
        </p>
      );
    }
    return <MerchantsTable rows={encryptedRows} canEdit={false} />;
  }

  if (merchants === undefined) {
    return <PageSpinner />;
  }

  if (merchants.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No merchants yet. They appear after ledger rows have merchant labels.
      </p>
    );
  }

  return (
    <MerchantsTable rows={merchants as MerchantRow[]} canEdit />
  );
}
