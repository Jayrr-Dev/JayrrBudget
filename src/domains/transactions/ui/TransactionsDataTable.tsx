"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
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
import { TagsCell } from "@/domains/transactions/ui/TagsCell";
import { TagsColumnHeader } from "@/domains/transactions/ui/TagsColumnHeader";

const columnHelper =
  createColumnHelper<DataTableFeatures, DashboardTransaction>();

function textOrDash(value: string | number | boolean | null | undefined) {
  if (value == null || value === "") {
    return (
      <span className="text-sm text-[var(--muted-foreground)]">—</span>
    );
  }
  return (
    <span className="line-clamp-2 block text-sm leading-snug break-words">
      {String(value)}
    </span>
  );
}

function chipList(values: string[]) {
  if (!values.length) {
    return <span className="text-sm text-[var(--muted-foreground)]">—</span>;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          className="max-w-full rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px] leading-snug font-medium break-words text-[var(--foreground)]"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

function buildColumns(accountNameById: Map<string, string>) {
  return columnHelper.columns([
    columnHelper.accessor("date", {
      header: "Posted",
      meta: { width: "7rem" },
      filterFn: "fuzzy",
      sortFn: "datetime",
    }),
    columnHelper.accessor("authorizedDate", {
      header: "Authorized",
      meta: { width: "7rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "datetime",
    }),
    columnHelper.accessor(
      (row) => accountNameById.get(row.accountId) ?? row.accountId,
      {
        id: "account",
        header: "Account",
        meta: { width: "22rem" },
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
      meta: { width: "22rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("name", {
      header: "Description",
      meta: { width: "28rem" },
      cell: ({ getValue }) => (
        <span className="line-clamp-2 block text-sm leading-snug font-medium break-words">
          {String(getValue())}
        </span>
      ),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("originalDescription", {
      header: "Original description",
      meta: { width: "28rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("merchantClean", {
      header: "Merchant clean",
      meta: { width: "20rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("sectionName", {
      header: "Section",
      meta: { width: "14rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("categoryName", {
      header: "Category",
      meta: { width: "20rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("subcategoryName", {
      header: "Subcategories",
      meta: { width: "20rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor((row) => row.tagNames ?? [], {
      id: "tags",
      header: () => <TagsColumnHeader />,
      meta: { width: "18rem", label: "Tags" },
      cell: ({ row, getValue }) => (
        <TagsCell
          transactionId={row.original.transactionId}
          tags={[...(getValue() as string[])]}
        />
      ),
      filterFn: "includesTag",
      sortFn: "textList",
    }),
    columnHelper.accessor("merchantName", {
      header: "Merchant name",
      meta: { width: "18rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("companyName", {
      header: "Company",
      meta: { width: "18rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("brandName", {
      header: "Brand",
      meta: { width: "14rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("transactionTypeName", {
      header: "Transaction type",
      meta: { width: "10rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor((row) => row.typeNames ?? [], {
      id: "typeNames",
      header: "Type",
      meta: { width: "18rem" },
      cell: ({ getValue }) => chipList([...(getValue() as string[])]),
      filterFn: "includesTag",
      sortFn: "textList",
    }),
    columnHelper.accessor("categoryPrimary", {
      header: "categoryPrimary",
      meta: { width: "22rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("categoryDetailed", {
      header: "categoryDetailed",
      meta: { width: "26rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("categoryConfidence", {
      header: "categoryConfidence",
      meta: { width: "14rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      sortFn: "text",
    }),
    columnHelper.accessor("paymentChannel", {
      header: "Channel",
      meta: { width: "9rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("transactionCode", {
      header: "Txn code",
      meta: { width: "9rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("bankDirection", {
      header: "Bank direction",
      meta: { width: "10rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("historyMatch", {
      header: "Cross-check",
      meta: { width: "12rem" },
      cell: ({ getValue }) => {
        const raw = String(getValue() ?? "");
        const label = historyMatchLabel(raw);
        if (!raw) {
          return <span className="text-sm text-[var(--muted-foreground)]">—</span>;
        }
        return (
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm leading-snug break-words">{label}</p>
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
      meta: { width: "10rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("source", {
      header: "Source",
      meta: { width: "9rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "equalsString",
      sortFn: "text",
    }),
    columnHelper.accessor("pending", {
      header: "Pending",
      meta: { width: "5rem" },
      cell: ({ getValue }) => textOrDash(getValue() ? "true" : "false"),
      sortFn: "basic",
    }),
    columnHelper.accessor("locationCity", {
      header: "City",
      meta: { width: "10rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("locationRegion", {
      header: "Region",
      meta: { width: "8rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("locationCountry", {
      header: "Country",
      meta: { width: "8rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("website", {
      header: "Website",
      meta: { width: "18rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("logoUrl", {
      header: "Logo URL",
      meta: { width: "18rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("transactionId", {
      header: "transactionId",
      meta: { width: "20rem" },
      cell: ({ getValue }) => (
        <span className="line-clamp-2 block font-mono text-[11px] leading-snug break-all">
          {String(getValue())}
        </span>
      ),
      filterFn: "fuzzy",
      sortFn: "text",
    }),
    columnHelper.accessor("isoCurrencyCode", {
      header: "CCY",
      meta: { width: "4rem" },
      cell: ({ getValue }) => textOrDash(getValue()),
      sortFn: "text",
    }),
    columnHelper.accessor((row) => ledgerDebitCredit(row).debit, {
      id: "debit",
      header: "Debit",
      meta: { width: "7rem" },
      cell: ({ row }) => {
        const debit = ledgerDebitCredit(row.original).debit;
        if (debit == null) {
          return (
            <span className="block text-right text-sm text-[var(--muted-foreground)]">
              —
            </span>
          );
        }
        return (
          <div className="line-clamp-2 text-right font-mono leading-snug break-words text-[var(--spend)]">
            {formatMoney(debit, row.original.isoCurrencyCode ?? "CAD")}
          </div>
        );
      },
      sortFn: "basic",
    }),
    columnHelper.accessor((row) => ledgerDebitCredit(row).credit, {
      id: "credit",
      header: "Credit",
      meta: { width: "7rem" },
      cell: ({ row }) => {
        const credit = ledgerDebitCredit(row.original).credit;
        if (credit == null) {
          return (
            <span className="block text-right text-sm text-[var(--muted-foreground)]">
              —
            </span>
          );
        }
        return (
          <div className="line-clamp-2 text-right font-mono leading-snug break-words text-[var(--income)]">
            {formatMoney(credit, row.original.isoCurrencyCode ?? "CAD")}
          </div>
        );
      },
      sortFn: "basic",
    }),
    columnHelper.accessor("amount", {
      header: "Amount",
      meta: { width: "7rem" },
      cell: ({ row, getValue }) => (
        <div className="line-clamp-2 text-right font-mono text-sm leading-snug break-words">
          {formatMoney(
            Number(getValue()),
            row.original.isoCurrencyCode ?? "CAD",
          )}
        </div>
      ),
      filterFn: "amountDirection",
      sortFn: "basic",
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
    () => buildColumns(accountNameById),
    [accountNameById],
  );

  const categoryOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.categoryName)),
    [transactions],
  );
  const companyOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.companyName)),
    [transactions],
  );
  const sectionOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.sectionName)),
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
  const typeOptions = useMemo(
    () => uniqueSorted(transactions.flatMap((txn) => txn.typeNames ?? [])),
    [transactions],
  );
  const detailedOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.categoryDetailed)),
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
      enableColumnToggle
      csvFilename="transactions.csv"
      isRefreshing={dashboardFetches > 0}
      onRefresh={() =>
        queryClient.refetchQueries({ queryKey: queryKeys.dashboard })
      }
      pageSize={25}
      filters={[
        {
          columnId: "sectionName",
          label: "Section",
          options: sectionOptions,
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
          columnId: "companyName",
          label: "Company",
          options: companyOptions,
        },
        {
          columnId: "transactionTypeName",
          label: "Transaction type",
          options: transactionTypeOptions,
        },
        {
          columnId: "typeNames",
          label: "Type",
          allLabel: "All types",
          options: typeOptions,
        },
        {
          columnId: "categoryDetailed",
          label: "Detailed",
          options: detailedOptions,
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
          label: "Flow",
          allLabel: "All",
          options: [
            { value: "spend", label: "Debit" },
            { value: "income", label: "Credit" },
          ],
        },
      ]}
    />
  );
}
