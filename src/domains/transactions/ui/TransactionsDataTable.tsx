"use client";

import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { displayAccountName } from "@/domains/dashboard/domain/accountName";
import { formatMoney } from "@/domains/dashboard/domain/money";
import { transactionTone } from "@/domains/dashboard/domain/moneyTone";
import type {
  DashboardAccount,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { MerchantLabel } from "@/domains/merchants/ui/MerchantLabel";
import { LOG_MONEY_RANGE_OPTIONS } from "@/domains/transactions/domain/amountLogRange";
import { historyMatchLabel } from "@/domains/transactions/domain/debitCredit";
import { TagsCell } from "@/domains/transactions/ui/TagsCell";
import { CreateTagButton } from "@/domains/transactions/ui/TagsColumnHeader";
import { TaxonomyCell } from "@/domains/transactions/ui/TaxonomyCell";
import { TransactionBulkActions } from "@/domains/transactions/ui/TransactionBulkActions";
import { TransactionRowActions } from "@/domains/transactions/ui/TransactionRowActions";
import { DecryptingStatus } from "@/domains/vault/ui/DecryptingStatus";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import {
  formatDisplayDate,
  formatLongDisplayDate,
} from "@/shared/lib/format-date";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";

const columnHelper = createColumnHelper<
  DataTableFeatures,
  DashboardTransaction
>();

type ColumnBand = "read" | "invent";

function bandMeta(
  width: string | undefined,
  band: ColumnBand,
  description: string,
  label?: string,
) {
  return {
    ...(width ? { width } : {}),
    band,
    description,
    ...(label ? { label } : {}),
  };
}

function textOrDash(value: string | number | boolean | null | undefined) {
  if (value == null || value === "") {
    return <span className="text-sm text-[var(--muted-foreground)]">-</span>;
  }
  const label = String(value);
  return (
    <span className="block truncate text-sm" title={label}>
      {label}
    </span>
  );
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

function needsClassify(txn: DashboardTransaction) {
  return !txn.categoryName?.trim();
}

function unclassifiedFirst(transactions: DashboardTransaction[]) {
  return [...transactions].sort((left, right) => {
    const leftOpen = needsClassify(left);
    const rightOpen = needsClassify(right);
    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
    return right.date.localeCompare(left.date);
  });
}

function buildColumns(
  accountNameById: Map<string, string>,
  accountTypeById: Map<string, string | null>,
) {
  // Left = paper facts (AI read from statement). Right = AI invent / labels.
  return columnHelper.columns([
    columnHelper.accessor((row) => (needsClassify(row) ? 0 : 1), {
      id: "classifyRank",
      header: "Needs classify",
      enableColumnFilter: false,
      sortFn: "basic",
      meta: { label: "Needs classify" },
    }),
    columnHelper.display({
      id: "actions",
      header: ({ table }) => (
        <TransactionBulkActions
          transactions={table.getRowModel().rows.map((row) => row.original)}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <TransactionRowActions transaction={row.original} />
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
      meta: { label: "Actions", width: "2rem" },
    }),
    columnHelper.group({
      id: "main",
      header: "Main",
      columns: columnHelper.columns([
        columnHelper.accessor("date", {
          header: "Posted",
          meta: bandMeta("14rem", "read", "Date the bank posted this line."),
          cell: ({ getValue }) => (
            <span className="text-base leading-snug md:text-sm">
              {formatLongDisplayDate(getValue())}
            </span>
          ),
          filterFn: "dateWindow",
          sortFn: "datetime",
        }),
        columnHelper.accessor("name", {
          header: "Description",
          meta: {
            ...bandMeta("28rem", "read", "Statement line text from the PDF."),
            grow: true,
            wrap: true,
            cardTitle: true,
          },
          cell: ({ getValue }) => (
            <span className="block text-sm font-medium leading-snug wrap-break-word">
              {String(getValue())}
            </span>
          ),
          filterFn: "equalsString",
          sortFn: "text",
        }),
        columnHelper.accessor("amount", {
          header: "Amount",
          meta: {
            ...bandMeta(
              undefined,
              "read",
              "Signed amount. Positive = money out.",
            ),
            autoWidth: (_value: unknown, row: unknown) => {
              const txn = row as DashboardTransaction;
              return formatMoney(
                Number(txn.amount),
                txn.isoCurrencyCode ?? "CAD",
              );
            },
            autoWidthPadCh: 3,
            autoWidthMinCh: 16,
          },
          cell: ({ row, getValue }) => {
            const amount = Number(getValue());
            return (
              <MoneyText
                amount={amount}
                currency={row.original.isoCurrencyCode ?? "CAD"}
                className="text-base leading-snug md:text-sm"
                tone={transactionTone(
                  row.original,
                  accountTypeById.get(row.original.accountId),
                )}
              />
            );
          },
          filterFn: "amountLogRange",
          sortFn: "basic",
        }),
        columnHelper.accessor("authorizedDate", {
          header: "Authorized",
          meta: bandMeta(
            "9.5rem",
            "read",
            "Purchase/auth date when it differs from posted.",
          ),
          cell: ({ getValue }) => {
            const value = getValue();
            if (value == null || value === "") {
              return (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              );
            }
            return (
              <span className="whitespace-nowrap font-mono text-xs tabular-nums">
                {formatDisplayDate(value)}
              </span>
            );
          },
          filterFn: "fuzzy",
          sortFn: "datetime",
        }),
        columnHelper.accessor("pending", {
          header: "Pending",
          meta: bandMeta(
            "5rem",
            "read",
            "True when the charge is not settled yet.",
          ),
          cell: ({ getValue }) => textOrDash(getValue() ? "true" : "false"),
          sortFn: "basic",
        }),
      ]),
    }),
    columnHelper.group({
      id: "class",
      header: "Class",
      columns: columnHelper.columns([
        columnHelper.accessor("sectionName", {
          header: "Section",
          meta: {
            ...bandMeta(
              undefined,
              "invent",
              "Top spend bucket (Lifestyle, Transport).",
            ),
            autoWidth: true,
            autoWidthPadCh: 8,
          },
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
          meta: {
            ...bandMeta(undefined, "invent", "Mid spend bucket under Section."),
            autoWidth: true,
            autoWidthPadCh: 8,
          },
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
          meta: {
            ...bandMeta(
              undefined,
              "invent",
              "Fine spend label (leaf category).",
            ),
            autoWidth: true,
            autoWidthPadCh: 8,
          },
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
      ]),
    }),
    columnHelper.group({
      id: "location",
      header: "Location",
      columns: columnHelper.columns([
        columnHelper.accessor("locationCity", {
          header: "City",
          meta: bandMeta(
            "10rem",
            "read",
            "City printed on the statement line.",
          ),
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
      ]),
    }),
    columnHelper.group({
      id: "money",
      header: "Money",
      columns: columnHelper.columns([
        columnHelper.accessor("isoCurrencyCode", {
          header: "CCY",
          meta: bandMeta(
            "4rem",
            "read",
            "Ledger currency for the posted amount (usually CAD).",
          ),
          cell: ({ getValue }) => textOrDash(getValue()),
          filterFn: "equalsString",
          sortFn: "text",
        }),
        columnHelper.accessor("foreignCurrency", {
          header: "Foreign",
          meta: bandMeta(
            "5rem",
            "read",
            "Original purchase currency when the line is FX (PHP, USD).",
          ),
          cell: ({ getValue }) => textOrDash(getValue()),
          filterFn: "equalsString",
          sortFn: "text",
        }),
        columnHelper.accessor("foreignAmount", {
          header: "FX amt",
          meta: {
            ...bandMeta(
              undefined,
              "read",
              "Original foreign charge size printed on the statement.",
            ),
            autoWidth: (_value: unknown, row: unknown) => {
              const txn = row as DashboardTransaction;
              if (txn.foreignAmount == null) return "-";
              return formatMoney(
                Number(txn.foreignAmount),
                txn.foreignCurrency ?? "CAD",
              );
            },
            autoWidthPadCh: 2,
            autoWidthMinCh: 10,
          },
          cell: ({ row, getValue }) => {
            const amount = getValue();
            if (amount == null) {
              return (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              );
            }
            return (
              <MoneyText
                amount={Number(amount)}
                currency={row.original.foreignCurrency ?? "CAD"}
                className="leading-snug"
              />
            );
          },
          filterFn: "amountLogRange",
          sortFn: "basic",
        }),
        columnHelper.accessor("exchangeRate", {
          header: "Rate",
          meta: bandMeta(
            "6rem",
            "read",
            "FX rate printed on the line (e.g. 0.024).",
          ),
          cell: ({ getValue }) => {
            const rate = getValue();
            if (rate == null) {
              return (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              );
            }
            return (
              <span
                className="font-mono text-xs tabular-nums"
                title={String(rate)}
              >
                {Number(rate)}
              </span>
            );
          },
          sortFn: "basic",
        }),
      ]),
    }),
    columnHelper.group({
      id: "source",
      header: "Source",
      columns: columnHelper.columns([
        columnHelper.accessor("originalDescription", {
          header: "Original description",
          meta: {
            ...bandMeta("28rem", "read", "Raw description before any cleanup."),
            wrap: true,
          },
          cell: ({ getValue }) => {
            const value = getValue();
            if (value == null || value === "") {
              return (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              );
            }
            const label = String(value);
            return (
              <span className="block text-sm leading-snug wrap-break-word">
                {label}
              </span>
            );
          },
          filterFn: "equalsString",
          sortFn: "text",
        }),
        columnHelper.accessor("source", {
          header: "Origin",
          meta: bandMeta(
            "9rem",
            "read",
            "Where this row came from (statement, CSV).",
          ),
          cell: ({ getValue }) => textOrDash(getValue()),
          filterFn: "equalsString",
          sortFn: "text",
        }),
        columnHelper.accessor(
          (row) => accountNameById.get(row.accountId) ?? row.accountId,
          {
            id: "account",
            header: "Account",
            meta: bandMeta("22rem", "read", "Friendly account name."),
            cell: ({ getValue }) => (
              <span
                className="block truncate text-sm"
                title={String(getValue())}
              >
                {String(getValue())}
              </span>
            ),
            filterFn: "fuzzy",
            sortFn: "text",
          },
        ),
        columnHelper.accessor("accountId", {
          header: "Account ID",
          meta: bandMeta("22rem", "read", "Stable ledger account key."),
          cell: ({ getValue }) => textOrDash(getValue()),
          filterFn: "fuzzy",
          sortFn: "text",
        }),
        columnHelper.accessor("transactionId", {
          header: "transactionId",
          meta: bandMeta(
            "20rem",
            "read",
            "Stable fingerprint for this ledger line.",
          ),
          cell: ({ getValue }) => (
            <span
              className="block truncate font-mono text-[11px]"
              title={String(getValue())}
            >
              {String(getValue())}
            </span>
          ),
          filterFn: "fuzzy",
          sortFn: "text",
        }),
      ]),
    }),
    columnHelper.group({
      id: "labels",
      header: "Labels",
      columns: columnHelper.columns([
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
            cell: ({ row, getValue }) => {
              const value = getValue();
              if (!value) {
                return (
                  <span className="text-sm text-[var(--muted-foreground)]">
                    -
                  </span>
                );
              }
              return (
                <MerchantLabel
                  name={String(value)}
                  src={row.original.logoUrl}
                  lookupName={row.original.merchantClean}
                  className="text-sm font-medium"
                />
              );
            },
            filterFn: "fuzzy",
            sortFn: "text",
          },
        ),
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
          header: "Tags",
          meta: {
            ...bandMeta(
              "18rem",
              "invent",
              "Manual tags you add to rows.",
              "Tags",
            ),
            wrap: true,
          },
          cell: ({ row, getValue }) => (
            <TagsCell
              transactionId={row.original.transactionId}
              tags={[...(getValue() as string[])]}
            />
          ),
          filterFn: "includesTag",
          sortFn: "textList",
        }),
      ]),
    }),
    columnHelper.group({
      id: "type",
      header: "Type",
      columns: columnHelper.columns([
        columnHelper.accessor("transactionTypeName", {
          header: "Transaction type",
          meta: bandMeta(
            "10rem",
            "invent",
            "Cash-flow bucket: income / transfers / expenses.",
          ),
          cell: ({ getValue }) => textOrDash(getValue()),
          filterFn: "equalsString",
          sortFn: "text",
        }),
        columnHelper.accessor("transactionCode", {
          header: "Code",
          meta: bandMeta(
            "10rem",
            "invent",
            "Line nature: purchase / payment / refund / fee / interest / subscription / transfer / ...",
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
          meta: bandMeta(
            "12rem",
            "invent",
            "Match status against bank history.",
          ),
          cell: ({ getValue }) => {
            const raw = String(getValue() ?? "");
            const label = historyMatchLabel(raw);
            if (!raw) {
              return (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              );
            }
            return (
              <div className="min-w-0">
                <p className="truncate text-sm" title={label ?? undefined}>
                  {label}
                </p>
                <p
                  className="truncate text-[11px] text-[var(--muted-foreground)]"
                  title={raw}
                >
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
      ]),
    }),
  ]);
}

export function TransactionsDataTable({
  transactions,
  accounts = [],
  loading = false,
}: {
  transactions: DashboardTransaction[];
  accounts?: DashboardAccount[];
  loading?: boolean;
}) {
  const queryClient = useQueryClient();
  const dashboardFetches = useIsFetching({ queryKey: queryKeys.dashboard });
  const encrypted = usePrivateLedger().encryptedLedger;

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.accountId, displayAccountName(account));
    }
    return map;
  }, [accounts]);

  const accountTypeById = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account.type])),
    [accounts],
  );

  const columns = useMemo(
    () => buildColumns(accountNameById, accountTypeById),
    [accountNameById, accountTypeById],
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
  const orderedTransactions = useMemo(
    () => unclassifiedFirst(transactions),
    [transactions],
  );

  return (
    <DataTable
      columns={columns}
      data={orderedTransactions}
      initialColumnVisibility={{
        classifyRank: false,
        account: false,
        accountId: false,
        authorizedDate: false,
        originalDescription: false,
        pending: false,
        locationCity: false,
        locationRegion: false,
        locationCountry: false,
        isoCurrencyCode: false,
        foreignCurrency: false,
        foreignAmount: false,
        exchangeRate: false,
        source: false,
        transactionId: false,
        merchant: false,
        spreadName: false,
        tags: false,
        transactionTypeName: false,
        transactionCode: false,
        paymentChannel: false,
        historyMatch: false,
        enrichmentStatus: false,
      }}
      initialSorting={[
        { id: "classifyRank", desc: false },
        { id: "date", desc: true },
      ]}
      enableGlobalFilter
      globalFilterFn="fuzzy"
      searchPlaceholder="Search…"
      enableColumnToggle
      dateColumnId="date"
      csvFilename="transactions.csv"
      toolbar={<CreateTagButton transactions={transactions} />}
      isRefreshing={dashboardFetches > 0}
      isLoading={loading}
      loadingSlot={encrypted ? <DecryptingStatus /> : undefined}
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
