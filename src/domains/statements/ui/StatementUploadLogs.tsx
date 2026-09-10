"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Icon } from "@iconify/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import {
  fetchStatementUpload,
  fetchStatementUploads,
} from "@/domains/statements/queries/fetchStatementUploads";
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

function OcrLogButton({ upload }: { upload: StatementUploadLog }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: statementQueryKeys.upload(upload.id),
    queryFn: () => fetchStatementUpload(upload.id),
    enabled: open && upload.hasOcr,
  });

  if (!upload.hasOcr) {
    return (
      <span className="text-xs text-[var(--muted-foreground)]">No OCR</span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        View OCR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{upload.filename}</DialogTitle>
            <DialogDescription>
              OCR markdown from Mistral for this upload.
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : detail.isError ? (
            <p className="text-sm text-red-700">{detail.error.message}</p>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs whitespace-pre-wrap">
              {detail.data.upload.ocrMarkdown ?? "(empty)"}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const columns = columnHelper.columns([
  columnHelper.display({
    id: "actions",
    header: () => (
      <span className="inline-flex items-center justify-center">
        <Icon
          icon="mynaui:mouse-pointer-click-solid"
          className="size-4 text-[var(--muted-foreground)]"
          aria-hidden
        />
        <span className="sr-only">Actions</span>
      </span>
    ),
    cell: ({ row }) => <StatementUploadRowActions upload={row.original} />,
    enableSorting: false,
    enableHiding: true,
    meta: { label: "Actions", width: "3.25rem" },
  }),
  columnHelper.accessor("createdAt", {
    header: "When",
    enableHiding: false,
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-sm">
        {formatWhen(String(getValue()))}
      </span>
    ),
  }),
  columnHelper.accessor("filename", {
    header: "File",
    enableHiding: false,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.original.filename}</p>
        <p className="truncate text-xs text-[var(--muted-foreground)]">
          {[row.original.institutionName, row.original.accountMask]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
    ),
    filterFn: "includesString",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableHiding: false,
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
    cell: ({ getValue }) => String(getValue() ?? "—"),
  }),
  columnHelper.display({
    id: "counts",
    header: "Txns",
    enableHiding: false,
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
            {openingBalance != null ? openingBalance.toFixed(2) : "—"} →{" "}
            {closingBalance != null ? closingBalance.toFixed(2) : "—"}
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
  columnHelper.display({
    id: "ocr",
    header: "Parse log",
    enableHiding: false,
    cell: ({ row }) => <OcrLogButton upload={row.original} />,
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
