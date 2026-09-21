"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import { StatementRerunButton } from "@/domains/statements/ui/StatementRerunButton";
import { StatementUploadBulkActions } from "@/domains/statements/ui/StatementUploadBulkActions";
import { StatementUploadRowActions } from "@/domains/statements/ui/StatementUploadRowActions";
import type { PrivateStatementLog } from "@/domains/vault/domain/privateLedger";
import { DecryptingStatus } from "@/domains/vault/ui/DecryptingStatus";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { createColumnHelper } from "@tanstack/react-table";

const columnHelper = createColumnHelper<
  DataTableFeatures,
  StatementUploadLog
>();

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function compactMd(date: Date, withYear: boolean) {
  const md = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  if (!withYear) return md;
  return `${md}/${String(date.getUTCFullYear()).slice(-2)}`;
}

function compactPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  if (!start || !end) return null;
  const startDate = parseYmd(start);
  const endDate = parseYmd(end);
  if (!startDate || !endDate) return `${start}–${end}`;
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  return `${compactMd(startDate, !sameYear)}–${compactMd(endDate, !sameYear)}`;
}

function statusVariant(status: string) {
  if (status === "completed") return "secondary" as const;
  if (status === "failed") return "destructive" as const;
  return "outline" as const;
}

const columns = columnHelper.columns([
  columnHelper.display({
    id: "actions",
    header: ({ table }) => (
      <StatementUploadBulkActions
        uploads={table.getRowModel().rows.map((row) => row.original)}
      />
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
    meta: { width: "7rem", nowrap: true },
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-sm">
        {formatWhen(String(getValue()))}
      </span>
    ),
  }),
  columnHelper.accessor("filename", {
    header: "File",
    enableHiding: false,
    meta: { width: "14rem", nowrap: true, grow: true, cardTitle: true },
    cell: ({ row }) => {
      const extra = [row.original.institutionName, row.original.accountMask]
        .filter(Boolean)
        .join(" · ");
      const title = extra
        ? `${row.original.filename} · ${extra}`
        : row.original.filename;
      return (
        <span className="block truncate font-medium" title={title}>
          {row.original.filename}
        </span>
      );
    },
    filterFn: "includesString",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    enableHiding: false,
    meta: { width: "6.25rem", nowrap: true },
    cell: ({ row }) => (
      <Badge
        variant={statusVariant(row.original.status)}
        title={row.original.error ?? row.original.status}
      >
        {row.original.status}
      </Badge>
    ),
  }),
  columnHelper.display({
    id: "categorized",
    header: "Categories",
    enableHiding: false,
    meta: { width: "5.5rem", nowrap: true },
    cell: ({ row }) => {
      const { categorized, categorizedCount, transactionCount } = row.original;
      const total = transactionCount ?? 0;
      if (total === 0) {
        return (
          <span className="text-xs text-[var(--muted-foreground)]">—</span>
        );
      }
      const label = categorized ? "Categorized" : "Not categorized";
      return (
        <span
          className="block truncate text-sm"
          title={`${label} · ${categorizedCount}/${total}`}
        >
          {categorizedCount}/{total}
        </span>
      );
    },
  }),
  columnHelper.accessor("pageCount", {
    header: "Pg",
    enableHiding: false,
    meta: { width: "2.75rem", nowrap: true, label: "Pages" },
    cell: ({ getValue }) => String(getValue() ?? "-"),
  }),
  columnHelper.display({
    id: "counts",
    header: "Txns",
    enableHiding: false,
    meta: { width: "3rem", nowrap: true },
    cell: ({ row }) => {
      const { insertedCount, transactionCount, updatedCount } = row.original;
      const title = `${transactionCount ?? 0} total · ${insertedCount ?? 0} new · ${updatedCount ?? 0} existing`;
      return (
        <span className="block truncate text-sm" title={title}>
          {insertedCount ?? 0}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "period",
    header: "Statement",
    enableHiding: false,
    meta: { width: "7.5rem", nowrap: true },
    cell: ({ row }) => {
      const period = compactPeriod(
        row.original.statementPeriodStart,
        row.original.statementPeriodEnd,
      );
      return (
        <span className="block truncate text-sm" title={period ?? undefined}>
          {period ?? "—"}
        </span>
      );
    },
  }),
  columnHelper.accessor(
    (row) => {
      const group = row.balanceOk === false ? 0 : row.balanceOk == null ? 1 : 2;
      const gap =
        row.balanceDelta == null ? 0 : Math.min(Math.abs(row.balanceDelta), 999_999);
      return group * 1_000_000 - gap;
    },
    {
      id: "balance",
      header: "Balance",
      enableHiding: false,
      sortFn: "basic",
      meta: { width: "6.5rem", nowrap: true },
      cell: ({ row }) => {
        const { balanceOk } = row.original;
        if (balanceOk == null) {
          return (
            <span className="text-sm text-[var(--muted-foreground)]">No check</span>
          );
        }
        const ok = balanceOk === true;
        return (
          <span
            className={
              ok
                ? "text-sm text-emerald-700 dark:text-emerald-400"
                : "text-sm text-red-700 dark:text-red-400"
            }
          >
            {ok ? "Balanced" : "Unbalanced"}
          </span>
        );
      },
    },
  ),
  columnHelper.accessor(
    (row) => {
      if (row.balanceOk == null || row.balanceDelta == null) {
        return Number.POSITIVE_INFINITY;
      }
      if (row.balanceOk === false) return -Math.abs(row.balanceDelta);
      return Math.abs(row.balanceDelta);
    },
    {
      id: "difference",
      header: "Difference",
      enableHiding: false,
      sortFn: "basic",
      meta: { width: "10rem", nowrap: true },
      cell: ({ row }) => {
        const { balanceOk, balanceDelta } = row.original;
        if (balanceOk == null || balanceDelta == null) {
          return (
            <span className="text-sm text-[var(--muted-foreground)]">—</span>
          );
        }
        const ok = balanceOk === true;
        const text = `${balanceDelta > 0 ? "+" : ""}${balanceDelta.toFixed(2)}`;
        return (
          <span className="flex items-center justify-end gap-1">
            <span
              className={
                ok
                  ? "text-sm tabular-nums text-emerald-700 dark:text-emerald-400"
                  : "text-sm tabular-nums text-red-700 dark:text-red-400"
              }
              title={ok ? "Within two cents of the closing balance" : text}
            >
              {text}
            </span>
            <StatementRerunButton upload={row.original} />
          </span>
        );
      },
    },
  ),
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
    fileHash: log.fileHash,
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

function StatementUploadLogsTable({ data }: { data: StatementUploadLog[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="filename"
      searchPlaceholder="Filter files…"
      pageSize={10}
      initialSorting={[{ id: "balance", desc: false }]}
      enableColumnToggle
      csvFilename="parse-logs.csv"
    />
  );
}

export function StatementUploadLogs() {
  const privateLedger = usePrivateLedger();

  if (privateLedger.loading || !privateLedger.unlocked) {
    return (
      <div className="flex justify-center py-10">
        <DecryptingStatus />
      </div>
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
  return <StatementUploadLogsTable data={uploads} />;
}
