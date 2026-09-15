"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { formatShortDisplayDate } from "@/shared/lib/format-date";

type TagByDateRangeResponse =
  | {
      ok: true;
      matched: number;
      updated: number;
      tag: string;
      startDate: string;
      endDate: string;
    }
  | { ok?: false; error: string };

type ExcludeOption = {
  value: string;
  label: string;
  date: string;
  postedDate: string;
  name: string;
  amount: string;
  amountValue: number;
};

type ExcludeSortKey = "Date" | "Description" | "Amount";

async function postTagByDateRange(input: {
  tag: string;
  startDate: string;
  endDate: string;
  excludeTransactionIds: string[];
}) {
  const response = await fetch("/api/transactions/tag-by-date-range", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as TagByDateRangeResponse;
  if (!response.ok || !("matched" in data)) {
    throw new Error(
      "error" in data ? data.error : "Failed to apply tag by date range",
    );
  }
  return data;
}

function buildExcludeOptions(
  transactions: DashboardTransaction[],
  startDate: string,
  endDate: string,
): ExcludeOption[] {
  if (!startDate || !endDate) return [];

  const byId = new Map<string, ExcludeOption>();
  for (const txn of transactions) {
    if (txn.date < startDate || txn.date > endDate) continue;
    if (byId.has(txn.transactionId)) continue;
    const date = formatShortDisplayDate(txn.date);
    const amount = formatMoney(
      txn.amount,
      txn.isoCurrencyCode ?? "CAD",
    );
    byId.set(txn.transactionId, {
      value: txn.transactionId,
      date,
      postedDate: txn.date,
      name: txn.name,
      amount,
      amountValue: Number(txn.amount),
      label: `${date} ${txn.name} ${amount}`,
    });
  }

  return [...byId.values()];
}

function sortExcludeOptions(
  options: ExcludeOption[],
  column: ExcludeSortKey,
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
    return a.name.localeCompare(b.name) * sign;
  });
}

/** Toolbar control to create a tag on every row in a posted-date window. */
export function CreateTagButton({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  const queryClient = useQueryClient();
  const excludeAnchor = useComboboxAnchor();
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<ExcludeSortKey>("Date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const excludeOptions = useMemo(
    () =>
      sortExcludeOptions(
        buildExcludeOptions(transactions, startDate, endDate),
        sortColumn,
        sortDirection,
      ),
    [transactions, startDate, endDate, sortColumn, sortDirection],
  );

  const excludeById = useMemo(() => {
    const map = new Map(excludeOptions.map((option) => [option.value, option]));
    return map;
  }, [excludeOptions]);

  const selectedExclude = useMemo(
    () =>
      excludeIds
        .map((id) => excludeById.get(id))
        .filter((option): option is ExcludeOption => Boolean(option)),
    [excludeIds, excludeById],
  );

  const mutation = useMutation({
    mutationFn: postTagByDateRange,
    onSuccess: async (result) => {
      setMessage(
        `Tagged ${result.updated} of ${result.matched} rows with “${result.tag}”.`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setTag("");
      setStartDate("");
      setEndDate("");
      setExcludeIds([]);
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Failed");
    },
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMessage(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          Create Tag
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 gap-3 p-3"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-1.5">
            Create Tag
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="About Create Tag"
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                className="w-72 gap-0 p-3.5"
              >
                <PopoverHeader className="gap-1.5">
                  <PopoverTitle>How Create Tag works</PopoverTitle>
                  <PopoverDescription>
                    Adds the tag to every row whose posted date falls in the
                    range. Use But Not to skip specific rows.
                  </PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </PopoverTitle>
          <PopoverDescription className="sr-only">
            Adds the tag to every row whose posted date falls in the range.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-2">
          <div className="space-y-1">
            <Label htmlFor="tag-by-range-name">Tag</Label>
            <Input
              id="tag-by-range-name"
              placeholder="New York 2026"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="tag-by-range-start">Start</Label>
              <Input
                id="tag-by-range-start"
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setExcludeIds([]);
                }}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tag-by-range-end">End</Label>
              <Input
                id="tag-by-range-end"
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setExcludeIds([]);
                }}
                disabled={mutation.isPending}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tag-by-range-but-not">But Not</Label>
            <Combobox
              items={excludeOptions}
              multiple
              value={selectedExclude}
              onValueChange={(next) => {
                setExcludeIds(next.map((item) => item.value));
              }}
              isItemEqualToValue={(a, b) => a.value === b.value}
              disabled={mutation.isPending || excludeOptions.length === 0}
            >
              <ComboboxChips
                ref={excludeAnchor}
                className="w-full min-w-0"
              >
                <ComboboxValue>
                  {selectedExclude.map((item) => (
                    <ComboboxChip
                      key={item.value}
                      className="max-w-[14rem] min-w-0 overflow-hidden"
                      title={`${item.date} · ${item.name}`}
                    >
                      <span className="min-w-0 truncate">
                        {item.date} · {item.name}
                      </span>
                    </ComboboxChip>
                  ))}
                </ComboboxValue>
                <ComboboxChipsInput
                  id="tag-by-range-but-not"
                  placeholder={
                    !startDate || !endDate
                      ? "Set dates first…"
                      : excludeOptions.length === 0
                        ? "No rows in range"
                        : "Search transactions…"
                  }
                  disabled={mutation.isPending || excludeOptions.length === 0}
                />
              </ComboboxChips>
              <ComboboxContent
                anchor={excludeAnchor}
                className="z-[60]"
                layout="table"
                columns={["Date", "Description", "Amount"]}
                sort={{ column: sortColumn, direction: sortDirection }}
                onSort={(column) => {
                  const next = column as ExcludeSortKey;
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
                <ComboboxEmpty>No transactions found.</ComboboxEmpty>
                <ComboboxList>
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      <span className="whitespace-nowrap font-mono text-sm tabular-nums">
                        {item.date}
                      </span>
                      <span className="min-w-0 truncate text-left">
                        {item.name}
                      </span>
                      <span className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                        {item.amount}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          {message ? (
            <p className="text-xs text-[var(--muted-foreground)]">{message}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={
              mutation.isPending || !tag.trim() || !startDate || !endDate
            }
            onClick={() =>
              mutation.mutate({
                tag: tag.trim(),
                startDate,
                endDate,
                excludeTransactionIds: excludeIds,
              })
            }
          >
            {mutation.isPending ? "Applying…" : "Apply tag"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
