"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { formatMoney } from "@/domains/dashboard/domain/money";
import {
  parseTxnDescriptionLookups,
  serializeTxnDescriptionLookups,
} from "@/domains/loans/application/matchLoanPayments";
import type { PrivateTransaction } from "@/domains/vault/domain/privateLedger";
import { formatShortDisplayDate } from "@/shared/lib/format-date";
import { useMemo, useState } from "react";

type TxnOption = {
  recordId: string;
  value: string;
  description: string;
  date: string;
  postedDate: string;
  amount: string;
  amountValue: number;
  label: string;
};

type SortKey = "Date" | "Description" | "Amount";

const MAX_OPTIONS = 200;

function optionFromDescription(description: string): TxnOption {
  const trimmed = description.trim();
  return {
    recordId: `lookup:${trimmed.toLowerCase()}`,
    value: trimmed.toLowerCase(),
    description: trimmed,
    date: "—",
    postedDate: "",
    amount: "",
    amountValue: 0,
    label: trimmed,
  };
}

function buildOptions(transactions: PrivateTransaction[]): TxnOption[] {
  const byId = new Map<string, TxnOption>();
  for (const txn of transactions) {
    const description = txn.description.trim();
    if (!description) continue;
    if (byId.has(txn.recordId)) continue;
    const date = formatShortDisplayDate(txn.date);
    const amount = formatMoney(txn.amount, txn.currency || "CAD");
    byId.set(txn.recordId, {
      recordId: txn.recordId,
      value: description.toLowerCase(),
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
  const anchor = useComboboxAnchor();
  const [inputValue, setInputValue] = useState("");
  const [sortColumn, setSortColumn] = useState<SortKey>("Date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const txnOptions = useMemo(
    () => sortOptions(buildOptions(transactions), sortColumn, sortDirection),
    [transactions, sortColumn, sortDirection],
  );

  const selected = useMemo(() => {
    return parseTxnDescriptionLookups(value).map((phrase) => {
      const key = phrase.toLowerCase();
      return (
        txnOptions.find((option) => option.value === key) ??
        optionFromDescription(phrase)
      );
    });
  }, [txnOptions, value]);

  const typed = inputValue.trim();
  const typedKey = typed.toLowerCase();
  const items = useMemo(() => {
    if (!typed) return txnOptions;
    const exists = txnOptions.some((option) => option.value === typedKey);
    const selectedHas = selected.some((option) => option.value === typedKey);
    if (exists || selectedHas) return txnOptions;
    return [optionFromDescription(typed), ...txnOptions];
  }, [selected, txnOptions, typed, typedKey]);

  return (
    <Combobox
      items={items}
      multiple
      value={selected}
      inputValue={inputValue}
      disabled={disabled}
      itemToStringLabel={(item) => item.description}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onInputValueChange={setInputValue}
      onValueChange={(next) => {
        onChange(
          serializeTxnDescriptionLookups(next.map((item) => item.description)),
        );
        setInputValue("");
      }}
    >
      <ComboboxChips ref={anchor} className="w-full min-w-0">
        <ComboboxValue>
          {selected.map((item) => (
            <ComboboxChip
              key={item.value}
              className="max-w-[18rem] min-w-0 overflow-hidden"
              title={item.description}
            >
              <span className="min-w-0 truncate">{item.description}</span>
            </ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          placeholder={placeholder}
          disabled={disabled}
        />
      </ComboboxChips>
      <ComboboxContent
        anchor={anchor}
        className="z-60"
        layout="table"
        columns={["Date", "Description", "Amount"]}
        sort={{ column: sortColumn, direction: sortDirection }}
        onSort={(column) => {
          const next = column as SortKey;
          if (next === sortColumn) {
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
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
            <ComboboxItem key={item.recordId} value={item}>
              <span className="overflow-hidden whitespace-nowrap font-mono text-sm tabular-nums">
                {item.date}
              </span>
              <span className="min-w-0 text-left text-sm leading-snug wrap-break-word whitespace-normal">
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
