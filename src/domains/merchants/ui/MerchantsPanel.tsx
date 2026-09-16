"use client";

import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { PageSpinner } from "@/components/ui/spinner";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { useMemo } from "react";

type MerchantRow = {
  id: string;
  slug: string;
  name: string;
  rawName: string | null;
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

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Merchant",
    cell: ({ getValue }) => cellText(getValue(), "text-sm font-medium"),
    filterFn: "includesString",
    sortFn: "text",
    meta: { width: "18rem", nowrap: true },
  }),
  columnHelper.accessor("rawName", {
    header: "Raw name",
    cell: ({ getValue }) => cellText(getValue()),
    filterFn: "fuzzy",
    sortFn: "text",
    meta: { width: "18rem", nowrap: true },
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
      cellText(getValue(), "font-mono text-xs text-[var(--muted-foreground)]"),
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
]);

function MerchantsTable({ rows }: { rows: MerchantRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      enableGlobalFilter
      globalFilterFn="fuzzy"
      searchPlaceholder="Filter merchants…"
      pageSize={25}
      enableColumnToggle
      csvFilename="merchants.csv"
      initialColumnVisibility={HIDDEN_COLUMNS}
    />
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
      rawName: merchant.rawName ?? null,
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
        rawName: tx.description,
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
    return <MerchantsTable rows={encryptedRows} />;
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

  return <MerchantsTable rows={merchants as MerchantRow[]} />;
}
