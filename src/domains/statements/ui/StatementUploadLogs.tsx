"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useConvexAuth, useQuery } from "convex/react";
import { Icon } from "@iconify/react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import { StatementUploadRowActions } from "@/domains/statements/ui/StatementUploadRowActions";
import type { PrivateStatementLog } from "@/domains/vault/domain/privateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";

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
        <StatementUploadRowActions upload={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: true,
    meta: { label: "Actions", width: "2rem" },
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
  columnHelper.display({
    id: "categorized",
    header: "Categories",
    enableHiding: false,
    meta: { width: "8rem" },
    cell: ({ row }) => {
      const { categorized, categorizedCount, transactionCount } = row.original;
      const total = transactionCount ?? 0;
      if (total === 0) {
        return (
          <span className="text-xs text-[var(--muted-foreground)]">No txns</span>
        );
      }
      return (
        <div className="space-y-1">
          <Badge variant={categorized ? "secondary" : "outline"}>
            {categorized ? "Categorized" : "Not categorized"}
          </Badge>
          <p className="text-xs text-[var(--muted-foreground)]">
            {categorizedCount}/{total}
          </p>
        </div>
      );
    },
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

function vaultLogId(recordId: string, createdAt: string) {
  const parsed = Date.parse(createdAt);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  let hash = 0;
  for (let index = 0; index < recordId.length; index += 1) {
    hash = (hash * 31 + recordId.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function isVaultTxCategorized(tx: {
  merchantClean?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  spreadName?: string | null;
  transactionTypeName?: string | null;
  txnCode?: string | null;
  channel?: string | null;
}) {
  return Boolean(
    tx.merchantClean &&
      tx.sectionName &&
      tx.categoryName &&
      tx.spreadName &&
      tx.transactionTypeName &&
      tx.txnCode &&
      tx.channel,
  );
}

function fromVaultLog(
  log: PrivateStatementLog,
  ledgerTxs: Array<{
    recordId: string;
    statementRecordId?: string | null;
    merchantClean?: string | null;
    sectionName?: string | null;
    categoryName?: string | null;
    spreadName?: string | null;
    transactionTypeName?: string | null;
    txnCode?: string | null;
    channel?: string | null;
  }>,
): StatementUploadLog {
  const txs = ledgerTxs.filter((tx) =>
    log.transactionIds?.length
      ? log.transactionIds.includes(tx.recordId)
      : tx.statementRecordId === log.recordId,
  );
  const categorizedCount = txs.filter(isVaultTxCategorized).length;
  const total = txs.length;
  return {
    id: vaultLogId(log.recordId, log.createdAt),
    source: "vault",
    recordId: log.recordId,
    transactionIds: log.transactionIds ?? [],
    ocrMarkdown: log.ocrMarkdown ?? null,
    filename: log.filename,
    status: log.status,
    institutionName: log.institutionName,
    accountName: log.accountName,
    accountMask: log.accountMask,
    currency: log.currency,
    pageCount: log.pageCount,
    transactionCount: log.transactionCount,
    insertedCount: log.insertedCount,
    updatedCount: log.updatedCount,
    skippedCount: log.skippedCount,
    statementPeriodStart: log.statementPeriodStart,
    statementPeriodEnd: log.statementPeriodEnd,
    openingBalance: log.openingBalance,
    closingBalance: log.closingBalance,
    totalDebits: null,
    totalCredits: null,
    transactionSum: log.transactionSum,
    computedClosing: log.computedClosing,
    balanceDelta: log.balanceDelta,
    balanceOk: log.balanceOk,
    error: null,
    hasOcr: Boolean(log.ocrMarkdown?.trim()),
    categorized: total > 0 && categorizedCount === total,
    categorizedCount,
    createdAt: log.createdAt,
    completedAt: log.createdAt,
  };
}

export function StatementUploadLogs() {
  const { isAuthenticated } = useConvexAuth();
  const privateLedger = usePrivateLedger();
  const result = useQuery(
    api.statements.list,
    isAuthenticated && !privateLedger.encryptedLedger ? {} : "skip",
  );

  if (privateLedger.encryptedLedger) {
    if (privateLedger.loading || !privateLedger.unlocked) {
      return (
        <p className="text-sm text-[var(--muted-foreground)]">
          {privateLedger.unlocked ? "Loading parse logs…" : "Loading encrypted parse logs…"}
        </p>
      );
    }
    const uploads = privateLedger.ledger.statementLogs.map((log) =>
      fromVaultLog(log, privateLedger.ledger.transactions),
    );
    if (uploads.length === 0) {
      return (
        <p className="text-sm text-[var(--muted-foreground)]">
          No parsed PDFs yet. Upload a statement above.
        </p>
      );
    }
    return (
      <DataTable
        columns={columns}
        data={uploads}
        searchKey="filename"
        searchPlaceholder="Filter files…"
        pageSize={10}
        enableColumnToggle
      />
    );
  }

  if (result === undefined) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Loading parse logs…
      </p>
    );
  }

  if (!result.ok) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {result.error}
      </div>
    );
  }

  if (result.uploads.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No parsed PDFs yet. Upload a statement above.
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={result.uploads as StatementUploadLog[]}
      searchKey="filename"
      searchPlaceholder="Filter files…"
      pageSize={10}
      enableColumnToggle
    />
  );
}
