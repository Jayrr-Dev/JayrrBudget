"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import {
  historyMatchLabel,
  ledgerDebitCredit,
} from "@/domains/transactions/domain/debitCredit";

const columnHelper =
  createColumnHelper<DataTableFeatures, DashboardTransaction>();

/** Separate section / category / type atoms — never one "a / b / c" string. */
function taxonomyAtoms(row: DashboardTransaction): string[] {
  const atoms = [row.sectionName, row.categoryName, row.typeName].filter(
    (value): value is string => Boolean(value),
  );
  if (atoms.length) return atoms;
  const fallback = row.categoryDetailed || row.categoryPrimary;
  return fallback ? [fallback] : [];
}

function merchantLabel(row: DashboardTransaction) {
  return row.merchantClean ?? row.merchantName ?? row.name;
}

export const transactionColumns = columnHelper.columns([
  columnHelper.accessor(merchantLabel, {
    id: "merchant",
    header: "Merchant",
    meta: { width: "26%" },
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{merchantLabel(row.original)}</p>
        {row.original.companyName ? (
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {[row.original.companyName, row.original.brandName]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    ),
    filterFn: "fuzzy",
    sortFn: "text",
  }),
  columnHelper.accessor("date", {
    header: "Date",
    meta: { width: "10%" },
    filterFn: "fuzzy",
    sortFn: "datetime",
  }),
  columnHelper.accessor(taxonomyAtoms, {
    id: "taxonomy",
    header: "Category",
    meta: { width: "22%" },
    cell: ({ getValue }) => {
      const atoms = [
        ...new Set(
          (getValue() as string[]).map((atom) =>
            atom.replaceAll("_", " ").toLowerCase(),
          ),
        ),
      ];
      if (!atoms.length) {
        return (
          <span className="text-sm text-[var(--muted-foreground)]">—</span>
        );
      }
      return (
        <div className="flex min-w-0 flex-wrap gap-1">
          {atoms.map((atom, index) => (
            <span
              key={`${index}-${atom}`}
              className="truncate rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--foreground)]"
            >
              {atom}
            </span>
          ))}
        </div>
      );
    },
    filterFn: "includesTag",
    sortFn: "textList",
    enableGlobalFilter: true,
  }),
  columnHelper.accessor((row) => row.tagNames ?? [], {
    id: "tags",
    header: "Tags",
    meta: { width: "16%" },
    cell: ({ getValue }) => {
      const tags = [...new Set(getValue() as string[])];
      if (!tags.length) {
        return (
          <span className="text-sm text-[var(--muted-foreground)]">—</span>
        );
      }
      return (
        <div className="flex min-w-0 flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span
              key={`${index}-${tag}`}
              className="truncate rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--foreground)]"
            >
              {tag}
            </span>
          ))}
        </div>
      );
    },
    filterFn: "includesTag",
    sortFn: "textList",
    enableGlobalFilter: true,
  }),
  columnHelper.accessor("paymentChannel", {
    header: "Channel",
    meta: { width: "12%" },
    cell: ({ getValue }) => (
      <span className="block truncate">{String(getValue() ?? "—")}</span>
    ),
    filterFn: "equalsString",
    sortFn: "text",
  }),
  columnHelper.accessor(
    (row) =>
      [
        row.companyName,
        row.brandName,
        row.originalDescription,
        row.name,
        ...taxonomyAtoms(row),
        ...(row.tagNames ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    {
      id: "details",
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableHiding: true,
      filterFn: "fuzzy",
    },
  ),
  columnHelper.accessor("historyMatch", {
    header: "Cross-check",
    meta: { width: "10%" },
    cell: ({ getValue }) => {
      const label = historyMatchLabel(String(getValue() ?? ""));
      if (label === "matched") {
        return <span className="block text-sm">Matched</span>;
      }
      if (label === "unmatched") {
        return (
          <span className="block text-sm text-[var(--muted-foreground)]">
            Unmatched
          </span>
        );
      }
      return (
        <span className="text-sm text-[var(--muted-foreground)]">—</span>
      );
    },
    filterFn: "equalsString",
    sortFn: "text",
  }),
  columnHelper.accessor((row) => ledgerDebitCredit(row).debit, {
    id: "debit",
    header: "Debit",
    meta: { width: "11%" },
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
        <div className="truncate text-right font-mono text-[var(--spend)]">
          {formatMoney(debit, row.original.isoCurrencyCode ?? "CAD")}
        </div>
      );
    },
    sortFn: "basic",
  }),
  columnHelper.accessor((row) => ledgerDebitCredit(row).credit, {
    id: "credit",
    header: "Credit",
    meta: { width: "11%" },
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
        <div className="truncate text-right font-mono text-[var(--income)]">
          {formatMoney(credit, row.original.isoCurrencyCode ?? "CAD")}
        </div>
      );
    },
    sortFn: "basic",
  }),
  columnHelper.accessor("amount", {
    header: () => null,
    cell: () => null,
    enableHiding: true,
    filterFn: "amountDirection",
    sortFn: "basic",
  }),
]);

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      value,
      label: value.replaceAll("_", " ").toLowerCase(),
    }));
}

export function TransactionsDataTable({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  const categoryOptions = useMemo(
    () =>
      uniqueSorted(transactions.flatMap(taxonomyAtoms)).map((option) => ({
        ...option,
        label: option.value.replaceAll("_", " ").toLowerCase(),
      })),
    [transactions],
  );

  const channelOptions = useMemo(
    () => uniqueSorted(transactions.map((txn) => txn.paymentChannel)),
    [transactions],
  );

  const matchOptions = useMemo(
    () => [
      { value: "matched", label: "Matched" },
      { value: "unmatched", label: "Unmatched" },
    ],
    [],
  );

  const tagOptions = useMemo(
    () =>
      uniqueSorted(transactions.flatMap((txn) => txn.tagNames ?? [])).map(
        (option) => ({
          ...option,
          label: option.value,
        }),
      ),
    [transactions],
  );

  return (
    <DataTable
      columns={transactionColumns}
      data={transactions}
      enableGlobalFilter
      globalFilterFn="fuzzy"
      searchPlaceholder="Fuzzy search merchants, categories, tags…"
      initialSorting={[{ id: "date", desc: true }]}
      initialColumnVisibility={{ details: false, amount: false }}
      pageSize={15}
      filters={[
        {
          columnId: "taxonomy",
          label: "Category",
          options: categoryOptions,
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
          label: "Type",
          allLabel: "All types",
          options: [
            { value: "spend", label: "Debit" },
            { value: "income", label: "Credit" },
          ],
        },
      ]}
    />
  );
}
