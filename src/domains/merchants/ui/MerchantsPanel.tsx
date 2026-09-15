"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";

type MerchantRow = {
  id: Id<"merchants">;
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
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-sm">{formatWhen(getValue())}</span>
    ),
    sortFn: "basic",
    meta: { width: "10rem" },
  }),
]);

export function MerchantsPanel() {
  const merchants = useQuery(api.merchants.list, {});
  const backfill = useMutation(api.merchants.backfillFromTransactions);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (merchants === undefined || syncedRef.current) return;
    syncedRef.current = true;
    void backfill({ limit: 1000 }).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Merchant sync failed");
    });
  }, [merchants, backfill]);

  if (merchants === undefined) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Loading merchants…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        {backfill.isPending
          ? "Syncing merchants from ledger…"
          : merchants.length === 0
            ? "No merchants yet. They appear after ledger rows have merchant labels."
            : `${merchants.length} merchant${merchants.length === 1 ? "" : "s"}`}
      </p>
      {merchants.length === 0 ? null : (
        <DataTable
          columns={columns}
          data={merchants}
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
