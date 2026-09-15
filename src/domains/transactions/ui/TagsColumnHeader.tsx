"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
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
};

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
    byId.set(txn.transactionId, {
      value: txn.transactionId,
      label: `${txn.date} · ${txn.name} · ${formatMoney(
        txn.amount,
        txn.isoCurrencyCode ?? "CAD",
      )}`,
    });
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Tags column header with + popover to tag a posted-date window. */
export function TagsColumnHeader({
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

  const excludeOptions = useMemo(
    () => buildExcludeOptions(transactions, startDate, endDate),
    [transactions, startDate, endDate],
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
        <button
          type="button"
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] opacity-60 transition-colors hover:bg-[var(--muted)] hover:opacity-100"
          aria-label="Add tag by date range"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 gap-3 p-3"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle>Tag by date range</PopoverTitle>
          <PopoverDescription>
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
                    <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
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
                className="z-[60] min-w-[18rem]"
              >
                <ComboboxEmpty>No transactions found.</ComboboxEmpty>
                <ComboboxList>
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      <span className="line-clamp-2 text-left">{item.label}</span>
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
