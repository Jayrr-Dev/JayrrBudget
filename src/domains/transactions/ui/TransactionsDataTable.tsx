"use client";

import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type {
  DashboardAccount,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import {
  historyMatchLabel,
  ledgerDebitCredit,
} from "@/domains/transactions/domain/debitCredit";
import { LOG_MONEY_RANGE_OPTIONS } from "@/domains/transactions/domain/amountLogRange";
import { TagsCell } from "@/domains/transactions/ui/TagsCell";
import { TagsColumnHeader } from "@/domains/transactions/ui/TagsColumnHeader";
import { TaxonomyCell } from "@/domains/transactions/ui/TaxonomyCell";
import { formatDisplayDate } from "@/shared/lib/format-date";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";

const columnHelper = createColumnHelper<
  DataTableFeatures,
  DashboardTransaction
>();

type ColumnBand = "read" | "invent";

function bandMeta(
  width: string,
  band: ColumnBand,
  description: string,
  label?: string,
) {
  return label
    ? { width, band, description, label }
    : { width, band, description };
}

function textOrDash(value: string | number | boolean | null | undefined) {
  if (value == null || value === "") {
    return <span className="text-sm text-[var(--muted-foreground)]">-</span>;
  }
  return (
    <span className="line-clamp-2 block text-sm leading-snug break-words">
      {String(value)}
    </span>
  );
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

/** Fit money cols to longest value + header chrome (sort / filter). */
function autoMoneyWidth(
  header: string,
  formatted: string[],
  { filter = false }: { filter?: boolean } = {},
) {
  const chromeCh = filter ? 6 : 3;
  let maxCh = header.length + chromeCh;
  for (const value of formatted) {
    maxCh = Math.max(maxCh, value.length + 1);
  }
  return `${Math.max(maxCh, 8)}ch`;
}

function buildColumns(
  accountNameById: Map<string, string>,
  transactions: DashboardTransaction[],
) {
  const debitLabels: string[] = [];
  const creditLabels: string[] = [];
  const amountLabels: string[] = [];
  for (const txn of transactions) {
    const ccy = txn.isoCurrencyCode ?? "CAD";
    const { debit, credit } = ledgerDebitCredit(txn);
    if (debit != null) debitLabels.push(formatMoney(debit, ccy));
    if (credit != null) creditLabels.push(formatMoney(credit, ccy));
    amountLabels.push(formatMoney(Number(txn.amount), ccy));
  }
  const debitWidth = autoMoneyWidth("Debit", debitLabels);
  const creditWidth = autoMoneyWidth("Credit", creditLabels);
  const amountWidth = autoMoneyWidth("Amount", amountLabels, { filter: true });

  // Left = paper facts (AI read from statement). Right = AI invent / labels.
  return columnHelper.columns([
    columnHelper.accessor("date", {
      header: "Posted",
      meta: bandMeta("9.5rem", "read", "Date the bank posted this line."),
      cell: ({ getValue }) => (
        <span className="font-mono text-sm tabular-nums">
          {formatDisplayDate(getValue())}
        </span>
      ),
      filterFn: "dateWindow",
      sortFn: "datetime",
    }),
    columnHelper.accessor("authorizedDate", {
      header: "Authorized",
      meta: bandMeta("9.5rem", "read", "Purchase/auth date when it differs from posted."),
      cell: ({ getValue }) => {
        const value = getValue();
        if (value == null || value === "") {
          return (
            <span className="text-sm text-[var(--muted-foreground)]">-</span>
          );
        }
        return (
          <span className="font-mono text-sm tabular-nums">
            {formatDisplayDate(value)}
          </span>
        );
      },
      filterFn: "fuzzy",
      sortFn: "datetime",
    }),
    columnHelper.accessor(
      (row) => accountNameById.get(row.accountId) ?? row.accountId,
      {
        id: "account",
        header: "Account",
        meta: bandMeta("22rem", "read", "Friendly account name."),
        cell: ({ getValue }) => (
          <span className="line-clamp-2 block text-sm leading-snug break-words">
            {String(getValue())}
          </span>
        ),
        filterFn: "fuzzy",
        sortFn: "text",
      },
    ),
    columnHelper.accessor("accountId", {
      header: "accountId",
      meta: bandMeta("22rem", "read", "Stable ledger account key."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("name", {
      header: "Description",
      meta: bandMeta("28rem", "read", "Statement line text from the PDF."),
      cell: ({ getValue }) => (
        <span className="line-clamp-2 block text-sm leading-snug font-medium break-words">
          {String(getValue())}
        </span>
      ),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("originalDescription", {
      header: "Original description",
      meta: bandMeta("28rem", "read", "Raw description before any cleanup."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("pending", {
      header: "Pending",
      meta: bandMeta("5rem", "read", "True when the charge is not settled yet."),
      cell: ({ getValue }) => textOrDash(getValue() ? "true" : "false"),
      sortFn: "basic",
    }),
    columnHelper.accessor("locationCity", {
      header: "City",
      meta: bandMeta("10rem", "read", "City printed on the statement line."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("locationRegion", {
      header: "Region",
      meta: bandMeta("8rem", "read", "Province/state printed on the line."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("locationCountry", {
      header: "Country",
      meta: bandMeta("8rem", "read", "Country printed on the line."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("isoCurrencyCode", {
      header: "CCY",
      meta: bandMeta("4rem", "read", "Currency code (usually CAD)."),
      cell: ({ getValue }) => textOrDash(getValue()),
      sortFn: "text",
    }),
    columnHelper.accessor((row) => ledgerDebitCredit(row).debit, {
      id: "debit",
      header: "Debit",
      meta: bandMeta(debitWidth, "read", "Money out (purchases, fees, PAD)."),
      cell: ({ row }) => {
        const debit = ledgerDebitCredit(row.original).debit;
        if (debit == null) {
          return (
            <span className="block text-right text-sm text-[var(--muted-foreground)]">
              -
            </span>
          );
        }
        return (
          <div className="whitespace-nowrap text-right font-mono leading-snug text-[var(--spend)]">
            {formatMoney(debit, row.original.isoCurrencyCode ?? "CAD")}
          </div>
        );
      },
      sortFn: "basic",
    }),
    columnHelper.accessor((row) => ledgerDebitCredit(row).credit, {
      id: "credit",
      header: "Credit",
      meta: bandMeta(creditWidth, "read", "Money in (deposits, refunds, payments)."),
      cell: ({ row }) => {
        const credit = ledgerDebitCredit(row.original).credit;
        if (credit == null) {
          return (
            <span className="block text-right text-sm text-[var(--muted-foreground)]">
              -
            </span>
          );
        }
        return (
          <div className="whitespace-nowrap text-right font-mono leading-snug text-[var(--income)]">
            {formatMoney(credit, row.original.isoCurrencyCode ?? "CAD")}
          </div>
        );
      },
      sortFn: "basic",
    }),
    columnHelper.accessor("amount", {
      header: "Amount",
      meta: bandMeta(amountWidth, "read", "Signed amount. Positive = money out."),
      cell: ({ row, getValue }) => (
        <div className="whitespace-nowrap text-right font-mono text-sm leading-snug">
          {formatMoney(
            Number(getValue()),
            row.original.isoCurrencyCode ?? "CAD",
          )}
        </div>
      ),
      filterFn: "amountLogRange",
      sortFn: "basic",
    }),
    columnHelper.accessor("source", {
      header: "Source",
      meta: bandMeta("9rem", "read", "Where this row came from (statement, CSV)."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("transactionId", {
      header: "transactionId",
      meta: bandMeta("20rem", "read", "Stable fingerprint for this ledger line."),
      cell: ({ getValue }) => (
        <span className="line-clamp-2 block font-mono text-[11px] leading-snug break-all">
          {String(getValue())}
        </span>
      ),
      filterFn: "fuzzy",
      sortFn: "text",
    }),

    // -- AI invent / labels (right) --
    columnHelper.accessor(
      (row) =>
        row.merchantClean ||
        row.brandName ||
        row.companyName ||
        row.merchantName ||
        null,
      {
        id: "merchant",
        header: "Merchant",
        meta: bandMeta(
          "16rem",
          "invent",
          "Clean store name from enrichment (falls back to brand / company).",
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) {
            return (
              <span className="text-sm text-[var(--muted-foreground)]">-</span>
            );
          }
          return (
            <span className="line-clamp-2 block text-sm leading-snug font-medium break-words">
              {String(value)}
            </span>
          );
        },
        filterFn: "fuzzy",
        sortFn: "text",
      },
    ),
    columnHelper.accessor("sectionName", {
      header: "Section",
      meta: bandMeta("14rem", "invent", "Top spend bucket (Lifestyle, Transport)."),
      cell: ({ row, getValue }) => (
        <TaxonomyCell
          transactionId={row.original.transactionId}
          field="section"
          value={getValue()}
        />
      ),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("categoryName", {
      header: "Category",
      meta: bandMeta("20rem", "invent", "Mid spend bucket under Section."),
      cell: ({ row, getValue }) => (
        <TaxonomyCell
          transactionId={row.original.transactionId}
          field="category"
          value={getValue()}
          sectionName={row.original.sectionName}
        />
      ),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("subcategoryName", {
      header: "Subcategories",
      meta: bandMeta("20rem", "invent", "Fine spend label (leaf category)."),
      cell: ({ row, getValue }) => (
        <TaxonomyCell
          transactionId={row.original.transactionId}
          field="subcategory"
          value={getValue()}
          categoryName={row.original.categoryName}
        />
      ),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("spreadName", {
      header: "Spread",
      meta: bandMeta("10rem", "invent", "Needs / Wants / Savings bucket."),
      cell: ({ row, getValue }) => (
        <TaxonomyCell
          transactionId={row.original.transactionId}
          field="spread"
          value={getValue()}
        />
      ),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor((row) => row.tagNames ?? [], {
      id: "tags",
      header: () => <TagsColumnHeader transactions={transactions} />,
      meta: bandMeta("18rem", "invent", "Manual tags you add to rows.", "Tags"),
      cell: ({ row, getValue }) => (
        <TagsCell
          transactionId={row.original.transactionId}
          tags={[...(getValue() as string[])]}
        />
      ),
      filterFn: "includesTag",
      sortFn: "textList",
    }),
    columnHelper.accessor("transactionTypeName", {
      header: "Transaction type",
      meta: bandMeta("10rem", "invent", "Cash-flow bucket: income / transfers / expenses."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("transactionCode", {
      header: "Code",
      meta: bandMeta(
        "10rem",
        "invent",
        "Line nature: purchase / payment / refund / fee / interest / subscription / transfer / …",
      ),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("paymentChannel", {
      header: "Channel",
      meta: bandMeta("9rem", "invent", "Online, in store, or other."),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("historyMatch", {
      header: "Cross-check",
      meta: bandMeta("12rem", "invent", "Match status against bank history."),
      cell: ({ getValue }) => {
        const raw = String(getValue() ?? "");
        const label = historyMatchLabel(raw);
        if (!raw) {
          return (
            <span className="text-sm text-[var(--muted-foreground)]">-</span>
          );
        }
        return (
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm leading-snug break-words">
              {label}
            </p>
            <p className="line-clamp-2 text-[11px] leading-snug break-words text-[var(--muted-foreground)]">
              {raw}
            </p>
          </div>
        );
      },
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("enrichmentStatus", {
      header: "Enrichment",
      meta: bandMeta(
        "10rem",
        "invent",
        "pending = not cleaned yet. done = messy bank text cleaned into a normal store name. failed = cleanup didn't finish.",
      ),
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
  ]);
}

export function TransactionsDataTable({
  transactions,
  accounts = [],
}: {
  transactions: DashboardTransaction[];
  accounts?: DashboardAccount[];
}) {
  const queryClient = useQueryClient();
  const dashboardFetches = useIsFetching({ queryKey: queryKeys.dashboard });

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.accountId, account.name);
    }
    return map;
  }, [accounts]);

  const columns = useMemo(
    () => buildColumns(accountNameById, transactions),
    [accountNameById, transactions],
  );

  const descriptionOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.name)),
    [transactions],
  );
  const originalDescriptionOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.originalDescription)),
    [transactions],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.categoryName)),
    [transactions],
  );
  const sectionOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.sectionName)),
    [transactions],
  );
  const spreadOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.spreadName)),
    [transactions],
  );
  const subcategoryOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.subcategoryName)),
    [transactions],
  );
  const transactionTypeOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.transactionTypeName)),
    [transactions],
  );
  const txnCodeOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.transactionCode)),
    [transactions],
  );
  const channelOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.paymentChannel)),
    [transactions],
  );
  const matchOptions = useMemo(
    () => [
      { value: "matched", label: "matched" },
      { value: "unmatched", label: "unmatched" },
    ],
    [],
  );
  const tagOptions = useMemo(
    () => uniqueSorted(transactions.flatMap((txn) => txn.tagNames ?? [])),
    [transactions],
  );

  return (
    <DataTable
      columns={columns}
      data={transactions}
      initialSorting={[{ id: "date", desc: true }]}
      enableGlobalFilter
      globalFilterFn="fuzzy"
      searchPlaceholder="Search all columns…"
      enableColumnToggle
      dateColumnId="date"
      csvFilename="transactions.csv"
      isRefreshing={dashboardFetches > 0}
      onRefresh={() =>
        queryClient.refetchQueries({ queryKey: queryKeys.dashboard })
      }
      pageSize={25}
      filters={[
        {
          columnId: "name",
          label: "Description",
          options: descriptionOptions,
        },
        {
          columnId: "originalDescription",
          label: "Original description",
          options: originalDescriptionOptions,
        },
        {
          columnId: "sectionName",
          label: "Section",
          options: sectionOptions,
        },
        {
          columnId: "spreadName",
          label: "Spread",
          options: spreadOptions,
        },
        {
          columnId: "categoryName",
          label: "Category",
          options: categoryOptions,
          cascadeFrom: ["sectionName"],
        },
        {
          columnId: "subcategoryName",
          label: "Subcategories",
          options: subcategoryOptions,
          cascadeFrom: ["sectionName", "categoryName"],
        },
        {
          columnId: "transactionTypeName",
          label: "Transaction type",
          options: transactionTypeOptions,
        },
        {
          columnId: "transactionCode",
          label: "Code",
          options: txnCodeOptions,
        },
        {
          columnId: "tags",
          label: "Tag",
          allLabel: "All tags",
          options: tagOptions,
        },
        {
          columnId: "paymentChannel",
          label: "Channel",
          options: channelOptions,
        },
        {
          columnId: "historyMatch",
          label: "Cross-check",
          allLabel: "All",
          options: matchOptions,
        },
        {
          columnId: "amount",
          label: "Amount",
          allLabel: "All amounts",
          options: LOG_MONEY_RANGE_OPTIONS,
        },
      ]}
    />
  );
}
