"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import { fetchStatementUploads } from "@/domains/statements/queries/fetchStatementUploads";
import { statementQueryKeys } from "@/domains/statements/queries/query-keys";
import { StatementUploadRowActions } from "@/domains/statements/ui/StatementUploadRowActions";

const columnHelper = createColumnHelper<DataTableFeatures, StatementUploadLog>();

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusVariant(status: string) {
  if (status === "completed") return "secondary" as const;
  if (status === "failed") return "destructive" as const;
  return "outline" as const;
}

const columns = columnHelper.columns([
  columnHelper.display({
    id: "actions",
    header: () => (
      <span className="flex w-full items-center justify-center">
        <Icon
          icon="mynaui:mouse-pointer-click-solid"
          className="size-4 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <span className="sr-only">Actions</span>
      </span>
    ),
    cell: ({ row }) => (
      <div className="flex w-full items-center justify-center">
        <StatementUploadRowActions upload={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: true,
    meta: { label: "Actions", width: "3.25rem" },
  }),
  columnHelper.accessor("createdAt", {
    header: "When",
    enableHiding: false,
    meta: { width: "12rem" },
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-sm">
        {formatWhen(String(getValue()))}
      </span>
    ),
  }),
  columnHelper.accessor("filename", {
    header: "File",
    enableHiding: false,
    meta: { width: "14rem" },
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.original.filename}</p>
        <p className="truncate text-xs text-[var(--muted-foreground)]">
          {[row.original.institutionName, row.original.accountMask]
            .filter(Boolean)
            .join(" · ") || "-"}
        </p>
      </div>
    ),
    filterFn: "includesString",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableHiding: false,
    meta: { width: "8rem" },
    cell: ({ row }) => (
      <div className="space-y-1">
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.status}
        </Badge>
        {row.original.error ? (
          <p className="max-w-[14rem] text-xs text-red-700">
            {row.original.error}
          </p>
        ) : null}
      </div>
    ),
  }),
  columnHelper.accessor("pageCount", {
    header: "Pages",
    enableHiding: false,
    meta: { width: "5rem" },
    cell: ({ getValue }) => String(getValue() ?? "-"),
  }),
  columnHelper.display({
    id: "counts",
    header: "Txns",
    enableHiding: false,
    meta: { width: "7rem" },
    cell: ({ row }) => {
      const { transactionCount, insertedCount, updatedCount } = row.original;
      return (
        <div className="text-sm">
          <p>{transactionCount ?? 0} total</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {insertedCount ?? 0} new · {updatedCount ?? 0} existing
          </p>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "balance",
    header: "Statement",
    enableHiding: false,
    meta: { width: "12rem" },
    cell: ({ row }) => {
      const {
        openingBalance,
        closingBalance,
        balanceOk,
        balanceDelta,
        statementPeriodStart,
        statementPeriodEnd,
      } = row.original;
      const period =
        statementPeriodStart && statementPeriodEnd
          ? `${statementPeriodStart} → ${statementPeriodEnd}`
          : null;
      return (
        <div className="min-w-[10rem] text-sm">
          {period ? (
            <p className="text-xs text-[var(--muted-foreground)]">{period}</p>
          ) : null}
          <p>
            {openingBalance != null ? openingBalance.toFixed(2) : "-"} →{" "}
            {closingBalance != null ? closingBalance.toFixed(2) : "-"}
          </p>
          {balanceOk === true ? (
            <p className="text-xs text-emerald-700">Balanced</p>
          ) : balanceOk === false ? (
            <p className="text-xs text-red-700">
              Off by {balanceDelta != null ? balanceDelta.toFixed(2) : "?"}
            </p>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">No check</p>
          )}
        </div>
      );
    },
  }),
]);

export function StatementUploadLogs() {
  const uploads = useQuery({
    queryKey: statementQueryKeys.uploads,
    queryFn: fetchStatementUploads,
  });

  if (uploads.isPending) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Loading parse logs…
      </p>
    );
  }

  if (uploads.isError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {uploads.error.message}
      </div>
    );
  }

  if (uploads.data.uploads.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No parsed PDFs yet. Upload a statement above.
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={uploads.data.uploads}
      searchKey="filename"
      searchPlaceholder="Filter files…"
      pageSize={10}
      enableColumnToggle
    />
  );
}
