"use client";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import type { TransactionTaxonomy } from "@/domains/transactions/application/getTransactionTaxonomy";
import type { RenameDescriptionTaxonomy } from "@/domains/transactions/application/renameTransactionDescriptions";
import {
  renameEncryptedDescriptions,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type TaxonomyResponse =
  | { ok: true; data: TransactionTaxonomy }
  | { ok?: false; error: string };

async function fetchTaxonomy() {
  const response = await fetch("/api/transactions/taxonomy");
  const data = (await response.json()) as TaxonomyResponse;
  if (!response.ok || !("data" in data)) {
    throw new Error("error" in data ? data.error : "Failed to load taxonomy");
  }
  return data.data;
}

function normName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

function unanimousName(values: Array<string | null | undefined>) {
  if (values.length === 0)
    return { value: null as string | null, mixed: false };
  const names = values.map(normName);
  const first = names[0] ?? null;
  if (names.every((name) => name === first)) {
    return { value: first, mixed: false };
  }
  return { value: null as string | null, mixed: true };
}

function sameTaxonomy(
  a: RenameDescriptionTaxonomy,
  b: RenameDescriptionTaxonomy,
) {
  return (
    a.section === b.section &&
    a.category === b.category &&
    a.subcategory === b.subcategory
  );
}

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

function TaxonomyPicker({
  id,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  value: string | null;
  options: string[];
  placeholder: string;
  disabled: boolean;
  onChange: (next: string | null) => void;
}) {
  return (
    <Combobox
      items={options}
      value={value}
      onValueChange={(next, details) => {
        const reason = details?.reason;
        if (reason && COMMIT_BLOCK_REASONS.has(reason)) return;
        const nextValue = typeof next === "string" ? normName(next) : null;
        if (nextValue === value) return;
        onChange(nextValue);
      }}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        className="w-full"
        showClear={Boolean(value)}
      />
      <ComboboxContent className="z-60 w-56">
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

export function EditDescriptionDialog({
  open,
  onOpenChange,
  currentDescription,
  currentSection,
  currentCategory,
  currentSubcategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDescription: string;
  currentSection?: string | null;
  currentCategory?: string | null;
  currentSubcategory?: string | null;
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const taxonomy = useQuery({
    queryKey: queryKeys.transactionTaxonomy,
    queryFn: fetchTaxonomy,
    staleTime: 60_000,
    enabled: open,
  });
  const [nextDescription, setNextDescription] = useState(currentDescription);
  const [section, setSection] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [taxonomySnapshot, setTaxonomySnapshot] =
    useState<RenameDescriptionTaxonomy>({
      section: null,
      category: null,
      subcategory: null,
    });

  const matches = useMemo(() => {
    if (!privateLedger.encryptedLedger) return [];
    return privateLedger.ledger.transactions.filter(
      (tx) => tx.description === currentDescription,
    );
  }, [
    privateLedger.encryptedLedger,
    privateLedger.ledger.transactions,
    currentDescription,
  ]);

  useEffect(() => {
    if (!open) return;
    setNextDescription(currentDescription);
    const fromMatches = matches.length > 0;
    const nextSection = fromMatches
      ? unanimousName(matches.map((tx) => tx.sectionName))
      : { value: normName(currentSection), mixed: false };
    const nextCategory = fromMatches
      ? unanimousName(matches.map((tx) => tx.categoryName))
      : { value: normName(currentCategory), mixed: false };
    const nextSubcategory = fromMatches
      ? unanimousName(matches.map((tx) => tx.subcategoryName))
      : { value: normName(currentSubcategory), mixed: false };
    setSection(nextSection.value);
    setCategory(nextCategory.value);
    setSubcategory(nextSubcategory.value);
    setTaxonomySnapshot({
      section: nextSection.value,
      category: nextCategory.value,
      subcategory: nextSubcategory.value,
    });
    // Snapshot once per open so a ledger refresh does not wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matchCount = privateLedger.encryptedLedger ? matches.length : null;
  const mixedTaxonomy =
    matches.length > 1 &&
    (unanimousName(matches.map((tx) => tx.sectionName)).mixed ||
      unanimousName(matches.map((tx) => tx.categoryName)).mixed ||
      unanimousName(matches.map((tx) => tx.subcategoryName)).mixed);

  const sectionOptions = useMemo(() => {
    const names = taxonomy.data?.sections.map((row) => row.name) ?? [];
    return namesMatching(names, section);
  }, [taxonomy.data, section]);

  const categoryOptions = useMemo(() => {
    const rows = taxonomy.data?.categories ?? [];
    const parent = section?.trim();
    const filtered = parent
      ? rows.filter(
          (row) =>
            !!row.sectionName &&
            row.sectionName.toLowerCase() === parent.toLowerCase(),
        )
      : rows;
    return namesMatching(
      filtered.map((row) => row.name),
      category,
    );
  }, [taxonomy.data, section, category]);

  const subcategoryOptions = useMemo(() => {
    const rows = taxonomy.data?.subcategories ?? [];
    const parent = category?.trim();
    const filtered = parent
      ? rows.filter(
          (row) =>
            !!row.categoryName &&
            row.categoryName.toLowerCase() === parent.toLowerCase(),
        )
      : rows;
    return namesMatching(
      filtered.map((row) => row.name),
      subcategory,
    );
  }, [taxonomy.data, category, subcategory]);

  const save = useMutation({
    mutationFn: async () => {
      const to = nextDescription.trim();
      if (!to) throw new Error("Description is required");
      const taxonomyPatch: RenameDescriptionTaxonomy = {
        section,
        category,
        subcategory,
      };
      const descriptionChanged = to !== currentDescription;
      const taxonomyChanged = !sameTaxonomy(taxonomyPatch, taxonomySnapshot);
      if (!descriptionChanged && !taxonomyChanged) return 0;
      const write = vaultWriteReady({
        encryptedLedger: privateLedger.encryptedLedger,
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (!write) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const updated = await renameEncryptedDescriptions(
        write,
        privateLedger.ledger.transactions,
        currentDescription,
        to,
        taxonomyChanged
          ? {
              sectionName: taxonomyPatch.section,
              categoryName: taxonomyPatch.category,
              subcategoryName: taxonomyPatch.subcategory,
            }
          : undefined,
      );
      privateLedger.reload();
      return updated;
    },
    onSuccess: async (updated) => {
      onOpenChange(false);
      if (updated === 0) return;
      toast.success(
        updated === 1
          ? "Updated 1 transaction"
          : `Updated ${updated} transactions`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  const taxonomyDisabled = save.isPending || taxonomy.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-slot=combobox-content]")) {
            event.preventDefault();
          }
        }}
        onFocusOutside={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-slot=combobox-content]")) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-slot=combobox-content]")) {
            event.preventDefault();
          }
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit matching transactions
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="Edit matching transactions info"
                  >
                    <Info className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-72">
                  <PopoverHeader>
                    <PopoverTitle>Edit matching transactions</PopoverTitle>
                    <PopoverDescription>
                      Change this statement line everywhere it appears.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Every transaction with this exact text is updated</li>
                      <li>
                        Section, category, and subcategory apply to all of them
                      </li>
                      <li>Original description stays as the bank printed it</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Updates every transaction with this exact description, including
              section, category, and subcategory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="edit-txn-description">Description</Label>
            <Input
              id="edit-txn-description"
              value={nextDescription}
              onChange={(event) => setNextDescription(event.target.value)}
              disabled={save.isPending}
              autoFocus
            />
            {matchCount != null ? (
              <p className="text-xs text-muted-foreground">
                {matchCount === 1
                  ? "1 transaction has this text."
                  : `${matchCount} transactions have this text.`}
                {mixedTaxonomy
                  ? " Categories differ; saving a category overwrites all of them."
                  : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                All transactions with this exact text will change.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-txn-section">Section</Label>
            <TaxonomyPicker
              id="edit-txn-section"
              value={section}
              options={sectionOptions}
              placeholder={mixedTaxonomy ? "Mixed" : "Section"}
              disabled={taxonomyDisabled}
              onChange={(next) => {
                setSection(next);
                setCategory(null);
                setSubcategory(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-txn-category">Category</Label>
            <TaxonomyPicker
              id="edit-txn-category"
              value={category}
              options={categoryOptions}
              placeholder={mixedTaxonomy && !category ? "Mixed" : "Category"}
              disabled={taxonomyDisabled}
              onChange={(next) => {
                setCategory(next);
                setSubcategory(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-txn-subcategory">Subcategory</Label>
            <TaxonomyPicker
              id="edit-txn-subcategory"
              value={subcategory}
              options={subcategoryOptions}
              placeholder={
                mixedTaxonomy && !subcategory ? "Mixed" : "Subcategory"
              }
              disabled={taxonomyDisabled}
              onChange={setSubcategory}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DescriptionActionsButton({
  description,
  onEdit,
}: {
  description: string;
  onEdit: (description: string) => void;
}) {
  return (
    <RowActionsMenu
      label={description}
      actions={[
        {
          label: "Edit",
          onSelect: () => onEdit(description),
        },
      ]}
    />
  );
}
