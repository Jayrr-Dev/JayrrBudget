"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type { PrivateTransaction } from "@/domains/vault/domain/privateLedger";
import { formatShortDisplayDate } from "@/shared/lib/format-date";
import { useMemo, useState } from "react";

type TxnOption = {
  value: string;
  description: string;
  date: string;
  postedDate: string;
  amount: string;
  amountValue: number;
  label: string;
};

type SortKey = "Date" | "Description" | "Amount";

const COMMIT_BLOCK_REASONS = new Set([
  "input-change",
  "input-clear",
  "list-navigation",
  "focus-out",
  "escape-key",
  "outside-press",
  "close-press",
  "cancel-open",
]);

const MAX_OPTIONS = 200;

function buildOptions(transactions: PrivateTransaction[]): TxnOption[] {
  const byId = new Map<string, TxnOption>();
  for (const txn of transactions) {
    const description = txn.description.trim();
    if (!description) continue;
    if (byId.has(txn.recordId)) continue;
    const date = formatShortDisplayDate(txn.date);
    const amount = formatMoney(txn.amount, txn.currency || "CAD");
    byId.set(txn.recordId, {
      value: txn.recordId,
      description,
      date,
      postedDate: txn.date,
      amount,
      amountValue: Number(txn.amount),
      label: `${date} ${description} ${amount}`,
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
    .slice(0, MAX_OPTIONS);
}

function sortOptions(
  options: TxnOption[],
  column: SortKey,
  direction: "asc" | "desc",
) {
  const sign = direction === "asc" ? 1 : -1;
  return [...options].sort((a, b) => {
    if (column === "Date") {
      return a.postedDate.localeCompare(b.postedDate) * sign;
    }
    if (column === "Amount") {
      return (a.amountValue - b.amountValue) * sign;
    }
    return a.description.localeCompare(b.description) * sign;
  });
}

type TxnDescriptionLookupComboboxProps = {
  id?: string;
  value: string;
  transactions: PrivateTransaction[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
};

export function TxnDescriptionLookupCombobox({
  id,
  value,
  transactions,
  disabled,
  placeholder = "Search transactions…",
  onChange,
}: TxnDescriptionLookupComboboxProps) {
  const [sortColumn, setSortColumn] = useState<SortKey>("Date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const options = useMemo(
    () => sortOptions(buildOptions(transactions), sortColumn, sortDirection),
    [transactions, sortColumn, sortDirection],
  );

  const selected = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return null;
    return (
      options.find((option) => option.description.toLowerCase() === needle) ??
      null
    );
  }, [options, value]);

  return (
    <Combobox
      items={options}
      value={selected}
      inputValue={value}
      disabled={disabled}
      itemToStringLabel={(item) => item.description}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onInputValueChange={(next) => {
        onChange(next);
      }}
      onValueChange={(next, details) => {
        const reason = details?.reason;
        if (reason && COMMIT_BLOCK_REASONS.has(reason)) return;
        if (next == null) {
          onChange("");
          return;
        }
        onChange(next.description);
      }}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        className="w-full"
        showClear={Boolean(value)}
        disabled={disabled}
      />
      <ComboboxContent
        className="z-60 w-[min(40rem,calc(100vw-1.5rem))]"
        layout="table"
        columns={["Date", "Description", "Amount"]}
        sort={{ column: sortColumn, direction: sortDirection }}
        onSort={(column) => {
          const next = column as SortKey;
          if (next === sortColumn) {
            setSortDirection((current) =>
              current === "asc" ? "desc" : "asc",
            );
            return;
          }
          setSortColumn(next);
          setSortDirection(next === "Description" ? "asc" : "desc");
        }}
      >
        <ComboboxEmpty>
          {transactions.length === 0
            ? "No transactions in vault"
            : "No transactions found."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              <span className="whitespace-nowrap font-mono text-sm tabular-nums">
                {item.date}
              </span>
              <span className="min-w-0 truncate text-left">
                {item.description}
              </span>
              <span className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                {item.amount}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
