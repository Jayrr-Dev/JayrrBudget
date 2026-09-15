"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { DashboardData } from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import type { TransactionTaxonomy } from "@/domains/transactions/application/getTransactionTaxonomy";
import type { TaxonomyField } from "@/domains/transactions/application/updateTransactionTaxonomy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type TaxonomyResponse =
  | { ok: true; data: TransactionTaxonomy }
  | { ok?: false; error: string };

type UpdateResponse =
  | {
      ok: true;
      transactionId: string;
      section: string | null;
      category: string | null;
      subcategory: string | null;
      spread: string | null;
    }
  | { ok?: false; error: string };

async function fetchTaxonomy() {
  const response = await fetch("/api/transactions/taxonomy");
  const data = (await response.json()) as TaxonomyResponse;
  if (!response.ok || !("data" in data)) {
    throw new Error("error" in data ? data.error : "Failed to load taxonomy");
  }
  return data.data;
}

async function postUpdateTaxonomy(input: {
  transactionId: string;
  field: TaxonomyField;
  value: string | null;
}) {
  const response = await fetch("/api/transactions/update-taxonomy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as UpdateResponse;
  if (!response.ok || !("transactionId" in data)) {
    throw new Error("error" in data ? data.error : "Failed to update");
  }
  return data;
}

/** Patch every dashboard query (overview + /transactions all-rows). */
function patchDashboardCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  result: Extract<UpdateResponse, { ok: true }>,
) {
  queryClient.setQueriesData<DashboardData>(
    { queryKey: queryKeys.dashboard },
    (current) => {
      if (!current?.transactions) return current;
      return {
        ...current,
        transactions: current.transactions.map((txn) =>
          txn.transactionId === result.transactionId
            ? {
                ...txn,
                sectionName: result.section,
                categoryName: result.category,
                subcategoryName: result.subcategory,
                spreadName: result.spread,
              }
            : txn,
        ),
      };
    },
  );
}

function useTaxonomy() {
  return useQuery({
    queryKey: queryKeys.transactionTaxonomy,
    queryFn: fetchTaxonomy,
    staleTime: 60_000,
  });
}

function namesMatching(
  names: string[],
  current: string | null | undefined,
): string[] {
  const list = [...names];
  const cur = current?.trim();
  if (cur && !list.some((name) => name.toLowerCase() === cur.toLowerCase())) {
    list.unshift(cur);
  }
  return list;
}

function normName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type TaxonomyCellProps = {
  transactionId: string;
  field: TaxonomyField;
  value: string | null | undefined;
  sectionName?: string | null;
  categoryName?: string | null;
  placeholder?: string;
};

/** Searchable combobox for one taxonomy column; options cascade from parent dims. */
export function TaxonomyCell({
  transactionId,
  field,
  value,
  sectionName,
  categoryName,
  placeholder = "-",
}: TaxonomyCellProps) {
  const queryClient = useQueryClient();
  const taxonomy = useTaxonomy();
  /** Optimistic selection while the POST is in flight / until props catch up. */
  const [pendingValue, setPendingValue] = useState<string | null | undefined>(
    undefined,
  );

  const committed = normName(value);
  const selected = pendingValue !== undefined ? pendingValue : committed;

  // Drop optimistic state once the dashboard row matches (incl. cascade clears).
  useEffect(() => {
    if (pendingValue === undefined) return;
    if (committed === pendingValue) {
      setPendingValue(undefined);
    }
  }, [committed, pendingValue]);

  const options = useMemo(() => {
    const data = taxonomy.data;
    if (!data) {
      return namesMatching([], selected);
    }

    if (field === "section") {
      return namesMatching(
        data.sections.map((row) => row.name),
        selected,
      );
    }
    if (field === "spread") {
      return namesMatching(
        data.spreads.map((row) => row.name),
        selected,
      );
    }
    if (field === "category") {
      const section = sectionName?.trim();
      const filtered = data.categories.filter((row) => {
        if (!section) return true;
        return (
          !!row.sectionName &&
          row.sectionName.toLowerCase() === section.toLowerCase()
        );
      });
      return namesMatching(
        filtered.map((row) => row.name),
        selected,
      );
    }
    const category = categoryName?.trim();
    const filtered = data.subcategories.filter((row) => {
      if (!category) return true;
      return (
        !!row.categoryName &&
        row.categoryName.toLowerCase() === category.toLowerCase()
      );
    });
    return namesMatching(
      filtered.map((row) => row.name),
      selected,
    );
  }, [taxonomy.data, field, selected, sectionName, categoryName]);

  const mutation = useMutation({
    mutationFn: postUpdateTaxonomy,
    onSuccess: (result) => {
      // Mutation body is source of truth - patch caches, do not refetch.
      // Refetching can reintroduce stale process-local Turso read cache.
      patchDashboardCaches(queryClient, result);
    },
    onError: (err) => {
      setPendingValue(undefined);
      toast.error(err instanceof Error ? err.message : "Update failed");
    },
  });

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next, details) => {
        // Only persist real commits - ignore filter/typing/focus noise.
        const reason = details?.reason;
        if (
          reason === "input-change" ||
          reason === "input-clear" ||
          reason === "list-navigation" ||
          reason === "focus-out" ||
          reason === "escape-key" ||
          reason === "outside-press" ||
          reason === "close-press" ||
          reason === "cancel-open"
        ) {
          return;
        }
        const nextValue = typeof next === "string" ? normName(next) : null;
        if (nextValue === selected) return;
        if (mutation.isPending) return;
        setPendingValue(nextValue);
        mutation.mutate({
          transactionId,
          field,
          value: nextValue,
        });
      }}
      disabled={mutation.isPending || taxonomy.isPending}
    >
      <ComboboxInput
        placeholder={placeholder}
        className="h-8 w-full min-w-[8rem] border-transparent bg-transparent shadow-none hover:border-[var(--border)] hover:bg-[var(--muted)]/40"
        showClear={Boolean(selected)}
      />
      <ComboboxContent className="w-56">
        <ComboboxEmpty>No match</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
