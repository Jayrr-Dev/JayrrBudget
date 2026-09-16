"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DataTable } from "@/components/ui/data-table";
import { PageSpinner } from "@/components/ui/spinner";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
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

const columnHelper = createColumnHelper<DataTableFeatures, MerchantRow>();

function textOrDash(value: string | null | undefined) {
  if (value == null || value === "") {
    return <span className="text-sm text-[var(--muted-foreground)]">-</span>;
  }
  return (
    <span className="line-clamp-2 block text-sm leading-snug break-words">
      {value}
    </span>
  );
}

function formatWhen(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Merchant",
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue()}</span>
    ),
    filterFn: "includesString",
    sortFn: "text",
    meta: { width: "14rem" },
  }),
  columnHelper.accessor("slug", {
    header: "Slug",
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-[var(--muted-foreground)]">
        {getValue()}
      </span>
    ),
    filterFn: "includesString",
    sortFn: "text",
    meta: { width: "12rem" },
  }),
  columnHelper.accessor("rawName", {
    header: "Raw name",
    cell: ({ getValue }) => textOrDash(getValue()),
    filterFn: "fuzzy",
    sortFn: "text",
    meta: { width: "14rem" },
  }),
  columnHelper.accessor("company", {
    header: "Company",
    cell: ({ getValue }) => textOrDash(getValue()),
    filterFn: "equalsString",
    sortFn: "text",
    meta: { width: "12rem" },
  }),
  columnHelper.accessor("brand", {
    header: "Brand",
    cell: ({ getValue }) => textOrDash(getValue()),
    filterFn: "fuzzy",
    sortFn: "text",
    meta: { width: "12rem" },
  }),
  columnHelper.accessor("website", {
    header: "Website",
    cell: ({ getValue }) => {
      const value = getValue();
      if (!value) return textOrDash(value);
      return (
        <a
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-1 text-sm text-[var(--foreground)] underline-offset-2 hover:underline"
        >
          {value}
        </a>
      );
    },
    filterFn: "fuzzy",
    sortFn: "text",
    meta: { width: "14rem" },
  }),
  columnHelper.accessor("updatedAt", {
    header: "Updated",
    cell: ({ getValue }) => {
      const label = formatWhen(getValue());
      if (!label) return textOrDash(null);
      return <span className="whitespace-nowrap text-sm">{label}</span>;
    },
    sortFn: "basic",
    meta: { width: "10rem" },
  }),
]);

export function MerchantsPanel() {
  const privateLedger = usePrivateLedger();
  const merchants = useQuery(
    api.merchants.list,
    privateLedger.encryptedLedger ? "skip" : {},
  );

  const encryptedRows = useMemo(() => {
    if (!privateLedger.encryptedLedger || !privateLedger.unlocked) return [] as MerchantRow[];
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
  }, [privateLedger.encryptedLedger, privateLedger.ledger, privateLedger.unlocked]);

  if (privateLedger.encryptedLedger) {
    if (privateLedger.loading) {
      return <PageSpinner />;
    }
    return (
      <div className="space-y-4">
        {privateLedger.loading || !privateLedger.unlocked ? (
          <PageSpinner />
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)]">
              {encryptedRows.length === 0
                ? "No merchants yet."
                : `${encryptedRows.length} merchant${encryptedRows.length === 1 ? "" : "s"}`}
            </p>
            {encryptedRows.length === 0 ? null : (
              <DataTable
                columns={columns}
                data={encryptedRows}
                searchKey="name"
                searchPlaceholder="Filter merchants…"
                pageSize={25}
                enableColumnToggle
                csvFilename="merchants.csv"
              />
            )}
          </>
        )}
      </div>
    );
  }

  if (merchants === undefined) {
    return <PageSpinner />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        {merchants.length === 0
          ? "No merchants yet. They appear after ledger rows have merchant labels."
          : `${merchants.length} merchant${merchants.length === 1 ? "" : "s"}`}
      </p>
      {merchants.length === 0 ? null : (
        <DataTable
          columns={columns}
          data={merchants as MerchantRow[]}
          searchKey="name"
          searchPlaceholder="Filter merchants…"
          pageSize={25}
          enableColumnToggle
          csvFilename="merchants.csv"
        />
      )}
    </div>
  );
}
