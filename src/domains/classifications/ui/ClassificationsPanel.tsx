"use client";

import { Badge } from "@/components/ui/badge";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
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
import type { RowActionsMenuItem } from "@/components/ui/row-actions-menu";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { PageSpinner } from "@/components/ui/spinner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Icon } from "@iconify/react";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

type Scope = "shared" | "user";
type Tab = "sections" | "categories" | "subcategories";

type SectionRow = {
  id: string;
  name: string;
  description: string;
  categoryNames?: string[];
  shared: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  description: string;
  sectionId: string | null;
  sectionName: string | null;
  subcategoryNames: string[];
  shared: boolean;
};

type SubcategoryRow = {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  sectionName?: string | null;
  shared: boolean;
};

type FormSub = {
  id?: string;
  name: string;
};

type FormState = {
  tab: Tab;
  mode: "create" | "edit";
  id?: string;
  name: string;
  description: string;
  parentId: string;
  subs: FormSub[];
};

const sectionHelper = createColumnHelper<DataTableFeatures, SectionRow>();
const categoryHelper = createColumnHelper<DataTableFeatures, CategoryRow>();
const subcategoryHelper = createColumnHelper<
  DataTableFeatures,
  SubcategoryRow
>();

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function sameLabel(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function childNamesCell(names: string[], emptyLabel: string) {
  if (names.length === 0) {
    return (
      <span className="text-sm text-[var(--muted-foreground)]">
        {emptyLabel}
      </span>
    );
  }
  return (
    <div className="flex max-w-full min-w-0 flex-wrap gap-1">
      {names.map((name) => (
        <Badge key={name} variant="secondary" className="shrink-0">
          {name}
        </Badge>
      ))}
    </div>
  );
}

function uniqueFilterOptions(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const value of values) {
    const label = value?.trim() ?? "";
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ label, value: label });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

function mergeLabelNames(
  left: string[] | undefined,
  right: string[] | undefined,
) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...(left ?? []), ...(right ?? [])]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function TitleInfo({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:text-primary"
          aria-label="About classifications"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Classifications</PopoverTitle>
          <PopoverDescription>
            {isAdmin
              ? "Shared is the starter pack you get. User is any extra label that is only yours."
              : "Labels for how you sort spending, starter set plus any you add."}
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>
              Section is the top bucket (Food, Lifestyle, Development, Travel)
            </li>
            <li>
              Category is the kind of spend inside that bucket (Groceries,
              Software, Pets)
            </li>
            <li>
              Subcategory is the specific flavor (Supermarket, Bars, Audiobooks)
            </li>
            {isAdmin ? (
              <>
                <li>Shared is the catalog every new user starts with</li>
                <li>User is any label you added that is not in shared</li>
                <li>
                  You can change your copy of a shared label. That stays on your
                  list
                </li>
                <li>Rename a shared label and it moves to User</li>
                <li>
                  Admins can add a liked user label to shared, or take one out
                </li>
              </>
            ) : (
              <li>Edit a starter label to make your own copy</li>
            )}
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function emptyForm(tab: Tab): FormState {
  return {
    tab,
    mode: "create",
    name: "",
    description: "",
    parentId: "",
    subs: tab === "categories" ? [{ name: "" }] : [],
  };
}

function parseTab(value: string | null): Tab | undefined {
  if (
    value === "sections" ||
    value === "categories" ||
    value === "subcategories"
  ) {
    return value;
  }
  return undefined;
}

export function ClassificationsPanel() {
  const searchParams = useSearchParams();
  const initialTab = parseTab(searchParams.get("tab"));
  const openCreate = searchParams.get("create") === "1";
  const catalog = useQuery(api.classifications.catalog, {});
  const repairHierarchy = useMutation(api.classifications.repairHierarchy);
  const createSection = useMutation(api.classifications.createSection);
  const updateSection = useMutation(api.classifications.updateSection);
  const deleteSection = useMutation(api.classifications.deleteSection);
  const createCategory = useMutation(api.classifications.createCategory);
  const updateCategory = useMutation(api.classifications.updateCategory);
  const deleteCategory = useMutation(api.classifications.deleteCategory);
  const createSubcategory = useMutation(api.classifications.createSubcategory);
  const updateSubcategory = useMutation(api.classifications.updateSubcategory);
  const deleteSubcategory = useMutation(api.classifications.deleteSubcategory);
  const promoteToShared = useMutation(api.classifications.promoteToShared);
  const removeFromShared = useMutation(api.classifications.removeFromShared);

  const [scope, setScope] = useState<Scope>(openCreate ? "user" : "shared");
  const [tab, setTab] = useState<Tab>(initialTab ?? "sections");
  const [form, setForm] = useState<FormState | null>(
    openCreate ? emptyForm(initialTab ?? "sections") : null,
  );
  const [saving, setSaving] = useState(false);

  const isAdmin = catalog?.isAdmin ?? false;
  const isCombined = !isAdmin;
  const isUserScope = !isCombined && scope === "user";
  const canAdd = isCombined || isUserScope;
  const mine = catalog?.mine;

  function editAsOwn(shared: boolean) {
    return isUserScope || (isCombined && !shared);
  }

  function findMineSection(name: string) {
    return mine?.sections.find((row) => sameLabel(row.name, name));
  }

  function findMineCategory(
    sectionName: string | null | undefined,
    name: string,
  ) {
    return mine?.categories.find(
      (row) =>
        sameLabel(row.name, name) &&
        sameLabel(row.sectionName ?? "", sectionName ?? ""),
    );
  }

  function findMineSubcategory(
    categoryName: string | null | undefined,
    name: string,
  ) {
    return mine?.subcategories.find(
      (row) =>
        sameLabel(row.name, name) &&
        sameLabel(row.categoryName ?? "", categoryName ?? ""),
    );
  }

  function subsForCategory(row: CategoryRow): FormSub[] {
    const names = row.subcategoryNames.length > 0 ? row.subcategoryNames : [""];
    return names.map((name) => {
      const mineRow = findMineSubcategory(row.name, name);
      return { id: mineRow?.id, name };
    });
  }

  useEffect(() => {
    void repairHierarchy({});
  }, [repairHierarchy]);

  async function remove(
    kind: "section" | "category" | "subcategory",
    id: string,
    name: string,
    fromSharedCopy = false,
  ) {
    const ok = window.confirm(
      fromSharedCopy
        ? `Remove "${name}" from your labels? The shared starter stays.`
        : `Delete "${name}"? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      if (kind === "section") {
        await deleteSection({ id: id as Id<"transactionSections"> });
      } else if (kind === "category") {
        await deleteCategory({ id: id as Id<"transactionCategories"> });
      } else {
        await deleteSubcategory({
          id: id as Id<"transactionSubcategories">,
        });
      }
      toast.success(`Deleted ${name}`);
    } catch (error) {
      toast.error(errorMessage(error, "Delete failed"));
    }
  }

  async function removeBulk<T extends { id: string; name: string }>(
    kind: "section" | "category" | "subcategory",
    rows: T[],
    resolveId?: (row: T) => string | null,
  ) {
    if (rows.length === 0) return;
    const ok = window.confirm(
      `Delete ${rows.length} visible ${kind}${rows.length === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!ok) return;
    let deleted = 0;
    for (const row of rows) {
      const id = resolveId ? resolveId(row) : row.id;
      if (!id) continue;
      try {
        if (kind === "section") {
          await deleteSection({ id: id as Id<"transactionSections"> });
        } else if (kind === "category") {
          await deleteCategory({ id: id as Id<"transactionCategories"> });
        } else {
          await deleteSubcategory({
            id: id as Id<"transactionSubcategories">,
          });
        }
        deleted += 1;
      } catch (error) {
        toast.error(errorMessage(error, `Could not delete ${row.name}`));
      }
    }
    if (deleted > 0) {
      toast.success(
        deleted === 1 ? `Deleted ${rows[0]?.name}` : `Deleted ${deleted}`,
      );
    }
  }

  async function promoteBulk(
    kind: "section" | "category" | "subcategory",
    rows: Array<{ id: string; name: string }>,
  ) {
    if (rows.length === 0) return;
    const ok = window.confirm(
      `Add ${rows.length} visible label${rows.length === 1 ? "" : "s"} to the shared catalog?`,
    );
    if (!ok) return;
    let added = 0;
    for (const row of rows) {
      try {
        const result = await promoteToShared({
          kind,
          sectionId:
            kind === "section"
              ? (row.id as Id<"transactionSections">)
              : undefined,
          categoryId:
            kind === "category"
              ? (row.id as Id<"transactionCategories">)
              : undefined,
          subcategoryId:
            kind === "subcategory"
              ? (row.id as Id<"transactionSubcategories">)
              : undefined,
        });
        if (result.added > 0) added += 1;
      } catch (error) {
        toast.error(errorMessage(error, `Could not share ${row.name}`));
      }
    }
    if (added > 0) {
      toast.success(
        added === 1 ? "Added 1 to shared" : `Added ${added} to shared`,
      );
    }
  }

  async function unshareBulk(
    kind: "section" | "category" | "subcategory",
    rows: Array<{
      name: string;
      sectionName?: string | null;
      categoryName?: string | null;
    }>,
  ) {
    if (rows.length === 0) return;
    const ok = window.confirm(
      `Remove ${rows.length} visible label${rows.length === 1 ? "" : "s"} from the shared catalog?`,
    );
    if (!ok) return;
    let removed = 0;
    for (const row of rows) {
      const section = kind === "section" ? row.name : (row.sectionName ?? "");
      try {
        const result = await removeFromShared({
          kind,
          section,
          category:
            kind === "category"
              ? row.name
              : kind === "subcategory"
                ? (row.categoryName ?? undefined)
                : undefined,
          subcategory: kind === "subcategory" ? row.name : undefined,
        });
        if (result.removed > 0) removed += 1;
      } catch (error) {
        toast.error(errorMessage(error, `Could not unshare ${row.name}`));
      }
    }
    if (removed > 0) {
      toast.success(
        removed === 1
          ? "Removed 1 from shared"
          : `Removed ${removed} from shared`,
      );
    }
  }

  async function editSection(row: SectionRow) {
    if (editAsOwn(row.shared)) {
      setForm({
        tab: "sections",
        mode: "edit",
        id: row.id,
        name: row.name,
        description: row.description,
        parentId: "",
        subs: [],
      });
      return;
    }
    try {
      const mineRow =
        findMineSection(row.name) ??
        (await createSection({
          name: row.name,
          description: row.description,
        }));
      setForm({
        tab: "sections",
        mode: "edit",
        id: mineRow.id,
        name: mineRow.name,
        description: mineRow.description,
        parentId: "",
        subs: [],
      });
    } catch (error) {
      toast.error(errorMessage(error, "Could not open your copy"));
    }
  }

  async function deleteSectionCopy(row: SectionRow) {
    if (editAsOwn(row.shared)) {
      void remove("section", row.id, row.name);
      return;
    }
    const mineRow = findMineSection(row.name);
    if (!mineRow) {
      toast.error("This starter label is not on your list yet");
      return;
    }
    void remove("section", mineRow.id, mineRow.name, true);
  }

  async function editCategory(row: CategoryRow) {
    if (editAsOwn(row.shared)) {
      setForm({
        tab: "categories",
        mode: "edit",
        id: row.id,
        name: row.name,
        description: row.description,
        parentId: row.sectionId ?? "",
        subs: subsForCategory(row),
      });
      return;
    }
    try {
      let section = row.sectionName
        ? findMineSection(row.sectionName)
        : undefined;
      if (!section && row.sectionName) {
        section = await createSection({ name: row.sectionName });
      }
      let mineRow = findMineCategory(row.sectionName, row.name);
      if (!mineRow) {
        if (!section) {
          toast.error("Need a section first");
          return;
        }
        mineRow = await createCategory({
          name: row.name,
          description: row.description,
          sectionId: section.id,
          subs: row.subcategoryNames.map((subName) => ({ name: subName })),
        });
      }
      setForm({
        tab: "categories",
        mode: "edit",
        id: mineRow.id,
        name: mineRow.name,
        description: mineRow.description,
        parentId: mineRow.sectionId ?? section?.id ?? "",
        subs: subsForCategory({
          ...row,
          id: mineRow.id,
          name: mineRow.name,
          description: mineRow.description,
          sectionId: mineRow.sectionId ?? section?.id ?? null,
          subcategoryNames: mergeLabelNames(
            row.subcategoryNames,
            mineRow.subcategoryNames,
          ),
        }),
      });
    } catch (error) {
      toast.error(errorMessage(error, "Could not open your copy"));
    }
  }

  async function deleteCategoryCopy(row: CategoryRow) {
    if (editAsOwn(row.shared)) {
      void remove("category", row.id, row.name);
      return;
    }
    const mineRow = findMineCategory(row.sectionName, row.name);
    if (!mineRow) {
      toast.error("This starter label is not on your list yet");
      return;
    }
    void remove("category", mineRow.id, mineRow.name, true);
  }

  async function editSubcategory(row: SubcategoryRow) {
    if (editAsOwn(row.shared)) {
      setForm({
        tab: "subcategories",
        mode: "edit",
        id: row.id,
        name: row.name,
        description: row.description,
        parentId: row.categoryId ?? "",
        subs: [],
      });
      return;
    }
    try {
      let category = findMineCategory(row.sectionName, row.categoryName ?? "");
      if (!category && row.categoryName) {
        let section = row.sectionName
          ? findMineSection(row.sectionName)
          : undefined;
        if (!section && row.sectionName) {
          section = await createSection({ name: row.sectionName });
        }
        if (!section) {
          toast.error("Need a section first");
          return;
        }
        category = await createCategory({
          name: row.categoryName,
          sectionId: section.id,
        });
      }
      let mineRow = findMineSubcategory(row.categoryName, row.name);
      if (!mineRow) {
        if (!category) {
          toast.error("Need a category first");
          return;
        }
        mineRow = await createSubcategory({
          name: row.name,
          description: row.description,
          categoryId: category.id,
        });
      }
      setForm({
        tab: "subcategories",
        mode: "edit",
        id: mineRow.id,
        name: mineRow.name,
        description: mineRow.description,
        parentId: mineRow.categoryId ?? category?.id ?? "",
        subs: [],
      });
    } catch (error) {
      toast.error(errorMessage(error, "Could not open your copy"));
    }
  }

  async function deleteSubcategoryCopy(row: SubcategoryRow) {
    if (editAsOwn(row.shared)) {
      void remove("subcategory", row.id, row.name);
      return;
    }
    const mineRow = findMineSubcategory(row.categoryName, row.name);
    if (!mineRow) {
      toast.error("This starter label is not on your list yet");
      return;
    }
    void remove("subcategory", mineRow.id, mineRow.name, true);
  }

  async function promote(
    kind: "section" | "category" | "subcategory",
    row: { id: string; name: string },
  ) {
    const ok = window.confirm(
      `Add "${row.name}" to the shared catalog? New users will get this label.`,
    );
    if (!ok) return;
    try {
      const result = await promoteToShared({
        kind,
        sectionId:
          kind === "section"
            ? (row.id as Id<"transactionSections">)
            : undefined,
        categoryId:
          kind === "category"
            ? (row.id as Id<"transactionCategories">)
            : undefined,
        subcategoryId:
          kind === "subcategory"
            ? (row.id as Id<"transactionSubcategories">)
            : undefined,
      });
      toast.success(
        result.added > 0
          ? `Added ${row.name} to shared`
          : `${row.name} was already shared`,
      );
    } catch (error) {
      toast.error(errorMessage(error, "Could not add to shared"));
    }
  }

  async function unshare(
    kind: "section" | "category" | "subcategory",
    row: {
      name: string;
      sectionName?: string | null;
      categoryName?: string | null;
    },
  ) {
    const section = kind === "section" ? row.name : (row.sectionName ?? "");
    const ok = window.confirm(
      `Remove "${row.name}" from the shared catalog? Existing users keep their own copy.`,
    );
    if (!ok) return;
    try {
      const result = await removeFromShared({
        kind,
        section,
        category:
          kind === "category"
            ? row.name
            : kind === "subcategory"
              ? (row.categoryName ?? undefined)
              : undefined,
        subcategory: kind === "subcategory" ? row.name : undefined,
      });
      toast.success(
        result.removed > 0
          ? `Removed ${row.name} from shared`
          : `${row.name} was not in shared`,
      );
    } catch (error) {
      toast.error(errorMessage(error, "Could not remove from shared"));
    }
  }

  const sectionColumns = useMemo(
    () =>
      sectionHelper.columns([
        sectionHelper.display({
          id: "actions",
          header: ({ table }) => {
            const rows = table.getRowModel().rows.map((row) => row.original);
            const owned = isCombined ? rows.filter((row) => !row.shared) : rows;
            const actions: RowActionsMenuItem[] = [
              isUserScope && isAdmin
                ? {
                    label: "Add visible to shared",
                    onSelect: () => void promoteBulk("section", rows),
                  }
                : null,
              !isUserScope && isAdmin
                ? {
                    label: "Remove visible from shared",
                    onSelect: () => void unshareBulk("section", rows),
                  }
                : null,
              owned.length > 0 || (!isCombined && !isUserScope)
                ? {
                    label: "Delete visible",
                    onSelect: () =>
                      void removeBulk(
                        "section",
                        isCombined ? owned : rows,
                        isUserScope || isCombined
                          ? (row) => row.id
                          : (row) => findMineSection(row.name)?.id ?? null,
                      ),
                    variant: "destructive" as const,
                  }
                : null,
            ].filter((action) => action !== null);
            return (
              <BulkActionsMenu
                label="visible sections"
                actions={actions}
                disabled={rows.length === 0}
              />
            );
          },
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editSection(row.original)}
                onDelete={
                  isCombined && row.original.shared
                    ? undefined
                    : () => void deleteSectionCopy(row.original)
                }
                onPromote={
                  isUserScope && isAdmin
                    ? () => void promote("section", row.original)
                    : undefined
                }
                onUnshare={
                  !isUserScope && isAdmin
                    ? () => void unshare("section", row.original)
                    : undefined
                }
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: true,
          meta: { label: "Actions", width: "2rem" },
        }),
        sectionHelper.group({
          id: "main",
          header: "Main",
          columns: sectionHelper.columns([
            sectionHelper.accessor("name", {
              header: "Section",
              cell: ({ getValue }) => (
                <span className="font-medium">{getValue()}</span>
              ),
              filterFn: "includesString",
              sortFn: "text",
              meta: { width: "11rem", nowrap: true, cardTitle: true },
            }),
            sectionHelper.accessor("categoryNames", {
              header: "Categories",
              cell: ({ getValue }) =>
                childNamesCell(getValue() ?? [], "No categories"),
              meta: { wrap: true },
              filterFn: (row, _columnId, filterValue) => {
                const names = row.original.categoryNames ?? [];
                const needle = String(filterValue ?? "")
                  .trim()
                  .toLowerCase();
                if (!needle) return true;
                return names.some((name) =>
                  name.toLowerCase().includes(needle),
                );
              },
            }),
            sectionHelper.accessor("description", {
              header: "Description",
              cell: ({ getValue }) => (
                <span
                  className="block truncate text-sm text-[var(--muted-foreground)]"
                  title={getValue() || "-"}
                >
                  {getValue() || "-"}
                </span>
              ),
              filterFn: "includesString",
              meta: { grow: true, cardSubtitle: true },
            }),
          ]),
        }),
      ]),
    [isAdmin, isCombined, isUserScope, mine],
  );

  const categoryColumns = useMemo(
    () =>
      categoryHelper.columns([
        categoryHelper.display({
          id: "actions",
          header: ({ table }) => {
            const rows = table.getRowModel().rows.map((row) => row.original);
            const owned = isCombined ? rows.filter((row) => !row.shared) : rows;
            const actions: RowActionsMenuItem[] = [
              isUserScope && isAdmin
                ? {
                    label: "Add visible to shared",
                    onSelect: () => void promoteBulk("category", rows),
                  }
                : null,
              !isUserScope && isAdmin
                ? {
                    label: "Remove visible from shared",
                    onSelect: () => void unshareBulk("category", rows),
                  }
                : null,
              owned.length > 0 || (!isCombined && !isUserScope)
                ? {
                    label: "Delete visible",
                    onSelect: () =>
                      void removeBulk(
                        "category",
                        isCombined ? owned : rows,
                        isUserScope || isCombined
                          ? (row) => row.id
                          : (row) =>
                              findMineCategory(
                                row.sectionName ?? null,
                                row.name,
                              )?.id ?? null,
                      ),
                    variant: "destructive" as const,
                  }
                : null,
            ].filter((action) => action !== null);
            return (
              <BulkActionsMenu
                label="visible categories"
                actions={actions}
                disabled={rows.length === 0}
              />
            );
          },
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editCategory(row.original)}
                onDelete={
                  isCombined && row.original.shared
                    ? undefined
                    : () => void deleteCategoryCopy(row.original)
                }
                onPromote={
                  isUserScope && isAdmin
                    ? () => void promote("category", row.original)
                    : undefined
                }
                onUnshare={
                  !isUserScope && isAdmin
                    ? () =>
                        void unshare("category", {
                          name: row.original.name,
                          sectionName: row.original.sectionName,
                        })
                    : undefined
                }
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: true,
          meta: { label: "Actions", width: "2rem" },
        }),
        categoryHelper.group({
          id: "main",
          header: "Main",
          columns: categoryHelper.columns([
            categoryHelper.accessor("sectionName", {
              header: "Section",
              cell: ({ getValue }) => (
                <span className="text-sm">{getValue() ?? "-"}</span>
              ),
              filterFn: "includesString",
              sortFn: "text",
              meta: { width: "11rem" },
            }),
            categoryHelper.accessor("name", {
              header: "Category",
              cell: ({ getValue }) => (
                <span className="font-medium">{getValue()}</span>
              ),
              filterFn: "includesString",
              sortFn: "text",
              meta: { cardTitle: true },
            }),
            categoryHelper.accessor("subcategoryNames", {
              header: "Sub",
              cell: ({ getValue }) =>
                childNamesCell(getValue() ?? [], "Needs a subcategory"),
              meta: { wrap: true },
              filterFn: (row, _columnId, filterValue) => {
                const names = row.original.subcategoryNames ?? [];
                const needle = String(filterValue ?? "")
                  .trim()
                  .toLowerCase();
                if (!needle) return true;
                return names.some((name) =>
                  name.toLowerCase().includes(needle),
                );
              },
            }),
            categoryHelper.accessor("description", {
              header: "Description",
              cell: ({ getValue }) => (
                <span
                  className="block truncate text-sm text-[var(--muted-foreground)]"
                  title={getValue() || "-"}
                >
                  {getValue() || "-"}
                </span>
              ),
              filterFn: "includesString",
              meta: { grow: true, cardSubtitle: true },
            }),
          ]),
        }),
      ]),
    [isAdmin, isCombined, isUserScope, mine],
  );

  const subcategoryColumns = useMemo(
    () =>
      subcategoryHelper.columns([
        subcategoryHelper.display({
          id: "actions",
          header: ({ table }) => {
            const rows = table.getRowModel().rows.map((row) => row.original);
            const owned = isCombined ? rows.filter((row) => !row.shared) : rows;
            const actions: RowActionsMenuItem[] = [
              isUserScope && isAdmin
                ? {
                    label: "Add visible to shared",
                    onSelect: () => void promoteBulk("subcategory", rows),
                  }
                : null,
              !isUserScope && isAdmin
                ? {
                    label: "Remove visible from shared",
                    onSelect: () => void unshareBulk("subcategory", rows),
                  }
                : null,
              owned.length > 0 || (!isCombined && !isUserScope)
                ? {
                    label: "Delete visible",
                    onSelect: () =>
                      void removeBulk(
                        "subcategory",
                        isCombined ? owned : rows,
                        isUserScope || isCombined
                          ? (row) => row.id
                          : (row) =>
                              findMineSubcategory(
                                row.categoryName ?? null,
                                row.name,
                              )?.id ?? null,
                      ),
                    variant: "destructive" as const,
                  }
                : null,
            ].filter((action) => action !== null);
            return (
              <BulkActionsMenu
                label="visible subcategories"
                actions={actions}
                disabled={rows.length === 0}
              />
            );
          },
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editSubcategory(row.original)}
                onDelete={
                  isCombined && row.original.shared
                    ? undefined
                    : () => void deleteSubcategoryCopy(row.original)
                }
                onPromote={
                  isUserScope && isAdmin
                    ? () => void promote("subcategory", row.original)
                    : undefined
                }
                onUnshare={
                  !isUserScope && isAdmin
                    ? () =>
                        void unshare("subcategory", {
                          name: row.original.name,
                          sectionName: row.original.sectionName,
                          categoryName: row.original.categoryName,
                        })
                    : undefined
                }
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: true,
          meta: { label: "Actions", width: "2rem" },
        }),
        subcategoryHelper.group({
          id: "main",
          header: "Main",
          columns: subcategoryHelper.columns([
            subcategoryHelper.accessor("sectionName", {
              header: "Section",
              cell: ({ getValue }) => (
                <span className="text-sm">{getValue() ?? "-"}</span>
              ),
              filterFn: "includesString",
              sortFn: "text",
              meta: { width: "11rem" },
            }),
            subcategoryHelper.accessor("categoryName", {
              header: "Category",
              cell: ({ getValue }) => (
                <span className="text-sm">{getValue() ?? "-"}</span>
              ),
              filterFn: "includesString",
              sortFn: "text",
            }),
            subcategoryHelper.accessor("name", {
              header: "Sub",
              cell: ({ getValue }) => (
                <span className="font-medium">{getValue()}</span>
              ),
              filterFn: "includesString",
              sortFn: "text",
              meta: { cardTitle: true },
            }),
            subcategoryHelper.accessor("description", {
              header: "Description",
              cell: ({ getValue }) => (
                <span
                  className="block truncate text-sm text-[var(--muted-foreground)]"
                  title={getValue() || "-"}
                >
                  {getValue() || "-"}
                </span>
              ),
              filterFn: "includesString",
              meta: { grow: true, cardSubtitle: true },
            }),
          ]),
        }),
      ]),
    [isAdmin, isCombined, isUserScope, mine],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (form.tab === "categories" && !form.parentId) {
      toast.error("Pick a section");
      return;
    }
    if (form.tab === "subcategories" && !form.parentId) {
      toast.error("Pick a category");
      return;
    }
    setSaving(true);
    try {
      if (form.tab === "sections") {
        if (form.mode === "create") {
          await createSection({ name, description: form.description });
        } else if (form.id) {
          await updateSection({
            id: form.id as Id<"transactionSections">,
            name,
            description: form.description,
          });
        }
      } else if (form.tab === "categories") {
        const sectionId = form.parentId as Id<"transactionSections">;
        const subs = form.subs
          .map((sub) => ({
            id: sub.id ? (sub.id as Id<"transactionSubcategories">) : undefined,
            name: sub.name.trim(),
          }))
          .filter((sub) => sub.name);
        if (form.mode === "create") {
          await createCategory({
            name,
            description: form.description,
            sectionId,
            subs,
          });
        } else if (form.id) {
          await updateCategory({
            id: form.id as Id<"transactionCategories">,
            name,
            description: form.description,
            sectionId,
            subs,
          });
        }
      } else if (form.tab === "subcategories") {
        const categoryId = form.parentId as Id<"transactionCategories">;
        if (form.mode === "create") {
          await createSubcategory({
            name,
            description: form.description,
            categoryId,
          });
        } else if (form.id) {
          await updateSubcategory({
            id: form.id as Id<"transactionSubcategories">,
            name,
            description: form.description,
            categoryId,
          });
        }
      }
      toast.success(form.mode === "create" ? "Created" : "Saved");
      setForm(null);
    } catch (error) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  const noun =
    tab === "sections"
      ? "section"
      : tab === "categories"
        ? "category"
        : "subcategory";

  function startCreate(nextTab: Tab = tab) {
    setScope("user");
    setTab(nextTab);
    setForm(emptyForm(nextTab));
  }

  const sharedSections = (catalog?.shared.sections ?? []).map((row) => {
    const mineRow = findMineSection(row.name);
    const categoryNames = (catalog?.shared.categories ?? [])
      .filter((category) => sameLabel(category.sectionName, row.name))
      .map((category) => category.name);
    return {
      id: mineRow?.id ?? row.name,
      name: row.name,
      description: mineRow?.description ?? row.description,
      categoryNames,
      shared: true,
    };
  });
  const sharedCategories = (catalog?.shared.categories ?? []).map((row) => {
    const mineRow = findMineCategory(row.sectionName, row.name);
    return {
      id: mineRow?.id ?? `${row.sectionName}::${row.name}`,
      name: row.name,
      description: mineRow?.description ?? row.description,
      sectionId: mineRow?.sectionId ?? null,
      sectionName: row.sectionName,
      subcategoryNames: mergeLabelNames(
        row.subcategoryNames,
        mineRow?.subcategoryNames,
      ),
      shared: true,
    };
  });
  const sharedSubs = (catalog?.shared.subcategories ?? []).map((row) => {
    const mineRow = findMineSubcategory(row.categoryName, row.name);
    return {
      id: mineRow?.id ?? `${row.sectionName}::${row.categoryName}::${row.name}`,
      name: row.name,
      description: mineRow?.description ?? row.description,
      categoryId: mineRow?.categoryId ?? null,
      categoryName: row.categoryName,
      sectionName: row.sectionName,
      shared: true,
    };
  });

  const own = catalog?.userOnly;
  const userCategories = (own?.categories ?? []).map((row) => ({
    ...row,
    subcategoryNames: row.subcategoryNames ?? [],
    shared: false,
  }));
  const userSections = (own?.sections ?? []).map((row) => ({
    ...row,
    categoryNames: userCategories
      .filter((category) => sameLabel(category.sectionName ?? "", row.name))
      .map((category) => category.name),
    shared: false,
  }));
  const userSubs = (own?.subcategories ?? []).map((row) => ({
    ...row,
    shared: false,
  }));

  const combinedCategories = [...sharedCategories, ...userCategories];
  const combinedSubs = [...sharedSubs, ...userSubs];
  const combinedSections = [...sharedSections, ...userSections].map((row) => ({
    ...row,
    categoryNames: combinedCategories
      .filter((category) => sameLabel(category.sectionName ?? "", row.name))
      .map((category) => category.name),
  }));

  const sections = isCombined
    ? combinedSections.slice().sort((a, b) => a.name.localeCompare(b.name))
    : isUserScope
      ? userSections
      : sharedSections;
  const categories = isCombined
    ? combinedCategories.slice().sort((a, b) => {
        const sectionCmp = (a.sectionName ?? "").localeCompare(
          b.sectionName ?? "",
        );
        if (sectionCmp !== 0) return sectionCmp;
        return a.name.localeCompare(b.name);
      })
    : isUserScope
      ? userCategories
      : sharedCategories;
  const subcategories = isCombined
    ? combinedSubs.slice().sort((a, b) => {
        const categoryCmp = (a.categoryName ?? "").localeCompare(
          b.categoryName ?? "",
        );
        if (categoryCmp !== 0) return categoryCmp;
        return a.name.localeCompare(b.name);
      })
    : isUserScope
      ? userSubs
      : sharedSubs;

  const sectionFilters = useMemo(
    () => [
      {
        columnId: "name",
        label: "Section",
        options: uniqueFilterOptions(sections.map((row) => row.name)),
      },
      {
        columnId: "categoryNames",
        label: "Category",
        options: uniqueFilterOptions(
          sections.flatMap((row) => row.categoryNames ?? []),
        ),
        cascadeFrom: ["name"],
      },
    ],
    [sections],
  );
  const categoryFilters = useMemo(
    () => [
      {
        columnId: "sectionName",
        label: "Section",
        options: uniqueFilterOptions(categories.map((row) => row.sectionName)),
      },
      {
        columnId: "name",
        label: "Category",
        options: uniqueFilterOptions(categories.map((row) => row.name)),
        cascadeFrom: ["sectionName"],
      },
      {
        columnId: "subcategoryNames",
        label: "Sub",
        options: uniqueFilterOptions(
          categories.flatMap((row) => row.subcategoryNames),
        ),
        cascadeFrom: ["sectionName", "name"],
      },
    ],
    [categories],
  );
  const subcategoryFilters = useMemo(
    () => [
      {
        columnId: "sectionName",
        label: "Section",
        options: uniqueFilterOptions(
          subcategories.map((row) => row.sectionName),
        ),
      },
      {
        columnId: "categoryName",
        label: "Category",
        options: uniqueFilterOptions(
          subcategories.map((row) => row.categoryName),
        ),
        cascadeFrom: ["sectionName"],
      },
      {
        columnId: "name",
        label: "Sub",
        options: uniqueFilterOptions(subcategories.map((row) => row.name)),
        cascadeFrom: ["sectionName", "categoryName"],
      },
    ],
    [subcategories],
  );

  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="type-kicker text-[20px] flex items-center gap-2">
          Classifications
          <TitleInfo isAdmin={isAdmin} />
        </h1>
      </header>

      {catalog === undefined ? (
        <PageSpinner className="min-h-40 py-8" />
      ) : (
        <div className="space-y-4">
          {isAdmin ? (
            <ButtonGroup className="max-w-full [&>button]:min-w-0 [&>button]:whitespace-normal">
              <Button
                type="button"
                size="sm"
                variant={scope === "shared" ? "default" : "outline"}
                onClick={() => setScope("shared")}
                aria-pressed={scope === "shared"}
              >
                Shared Classifications
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "user" ? "default" : "outline"}
                onClick={() => setScope("user")}
                aria-pressed={scope === "user"}
              >
                User Classification
              </Button>
            </ButtonGroup>
          ) : null}

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as Tab)}
            className="gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ButtonGroup
                className="max-w-full [&>button]:min-w-0 [&>button]:whitespace-normal"
                aria-label="Classification type"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "sections" ? "default" : "outline"}
                  onClick={() => setTab("sections")}
                  aria-pressed={tab === "sections"}
                >
                  Sections
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "categories" ? "default" : "outline"}
                  onClick={() => setTab("categories")}
                  aria-pressed={tab === "categories"}
                >
                  Categories
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "subcategories" ? "default" : "outline"}
                  onClick={() => setTab("subcategories")}
                  aria-pressed={tab === "subcategories"}
                >
                  Subcategories
                </Button>
              </ButtonGroup>
              {canAdd ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setForm(emptyForm(tab))}
                >
                  Add {noun}
                </Button>
              ) : null}
            </div>

            <TabsContent value="sections" className="space-y-4">
              {sections.length === 0 ? (
                <EmptyPrompt
                  className="py-10"
                  title={
                    isCombined
                      ? "No sections yet"
                      : isUserScope
                        ? "No user-only sections"
                        : "No shared sections yet"
                  }
                  description={
                    isCombined
                      ? "Add a section to start grouping spend."
                      : isUserScope
                        ? "Names that match shared stay under Shared."
                        : "Add one on your User list."
                  }
                  action={
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => startCreate("sections")}
                    >
                      Add section
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={sectionColumns}
                  data={sections}
                  searchKey="name"
                  searchPlaceholder="Filter sections…"
                  filters={sectionFilters}
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={
                    isCombined
                      ? "classifications-sections.csv"
                      : `${scope}-sections.csv`
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              {categories.length === 0 ? (
                <EmptyPrompt
                  className="py-10"
                  title={
                    isCombined
                      ? "No categories yet"
                      : isUserScope
                        ? "No user-only categories"
                        : "No shared categories yet"
                  }
                  description={
                    isCombined
                      ? "Add a category under a section."
                      : isUserScope
                        ? "Names that match shared stay under Shared."
                        : "Add one on your User list."
                  }
                  action={
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => startCreate("categories")}
                    >
                      Add category
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={categoryColumns}
                  data={categories}
                  searchKey="name"
                  searchPlaceholder="Filter categories…"
                  filters={categoryFilters}
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={
                    isCombined
                      ? "classifications-categories.csv"
                      : `${scope}-categories.csv`
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="subcategories" className="space-y-4">
              {subcategories.length === 0 ? (
                <EmptyPrompt
                  className="py-10"
                  title={
                    isCombined
                      ? "No subcategories yet"
                      : isUserScope
                        ? "No user-only subcategories"
                        : "No shared subcategories yet"
                  }
                  description={
                    isCombined
                      ? "Add a subcategory under a category."
                      : isUserScope
                        ? "Names that match shared stay under Shared."
                        : "Add one on your User list."
                  }
                  action={
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => startCreate("subcategories")}
                    >
                      Add subcategory
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={subcategoryColumns}
                  data={subcategories}
                  searchKey="name"
                  searchPlaceholder="Filter subcategories…"
                  filters={subcategoryFilters}
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={
                    isCombined
                      ? "classifications-subcategories.csv"
                      : `${scope}-subcategories.csv`
                  }
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        {form ? (
          <DialogContent
            className="flex flex-col gap-4 sm:max-w-lg"
            showCloseButton
          >
            <form
              onSubmit={(event) => void onSubmit(event)}
              className="flex flex-col gap-4"
            >
              <DialogHeader className="shrink-0">
                <DialogTitle>
                  {form.mode === "create" ? "Add" : "Edit"}{" "}
                  {form.tab === "sections"
                    ? "section"
                    : form.tab === "categories"
                      ? "category"
                      : "subcategory"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Name this classification and choose where it belongs.
                </DialogDescription>
              </DialogHeader>

              <div className="grid shrink-0 gap-4 sm:grid-cols-2">
                {form.tab === "categories" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="classification-section">Section</Label>
                    <select
                      id="classification-section"
                      className={selectClassName}
                      value={form.parentId}
                      onChange={(event) =>
                        setForm({ ...form, parentId: event.target.value })
                      }
                      required
                    >
                      <option value="">Select a section</option>
                      {(catalog?.parents.sections ?? []).map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {form.tab === "subcategories" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="classification-category">Category</Label>
                    <select
                      id="classification-category"
                      className={selectClassName}
                      value={form.parentId}
                      onChange={(event) =>
                        setForm({ ...form, parentId: event.target.value })
                      }
                      required
                    >
                      <option value="">Select a category</option>
                      {(catalog?.parents.categories ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.sectionName
                            ? `${category.sectionName} / ${category.name}`
                            : category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div
                  className={
                    form.tab === "sections"
                      ? "space-y-1.5 sm:col-span-2"
                      : "space-y-1.5"
                  }
                >
                  <Label htmlFor="classification-name">Name</Label>
                  <Input
                    id="classification-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    required
                  />
                </div>
              </div>
              {form.tab === "categories" ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Subcategories</Label>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5">
                    {form.subs.map((sub, index) => (
                      <div
                        key={sub.id ?? `new-${index}`}
                        className="col-span-2 grid grid-cols-subgrid items-center"
                      >
                        <Input
                          value={sub.name}
                          onChange={(event) => {
                            const next = form.subs.slice();
                            const current = next[index];
                            if (!current) return;
                            next[index] = {
                              ...current,
                              name: event.target.value,
                            };
                            setForm({ ...form, subs: next });
                          }}
                          placeholder="Subcategory name"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="shrink-0"
                          onClick={() => {
                            const next = form.subs.filter(
                              (_, i) => i !== index,
                            );
                            setForm({
                              ...form,
                              subs: next.length > 0 ? next : [{ name: "" }],
                            });
                          }}
                          aria-label={`Remove ${sub.name || "subcategory"}`}
                        >
                          <Icon icon="lucide:minus" className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      setForm({
                        ...form,
                        subs: [...form.subs, { name: "" }],
                      })
                    }
                  >
                    Add subcategory
                  </Button>
                </div>
              ) : null}
              <div className="shrink-0 space-y-1.5">
                <Label htmlFor="classification-description">Description</Label>
                <Textarea
                  id="classification-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  rows={2}
                />
              </div>
              <DialogFooter className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function RowActions({
  name,
  onEdit,
  onDelete,
  onPromote,
  onUnshare,
}: {
  name: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onPromote?: () => void;
  onUnshare?: () => void;
}) {
  const actions = [
    onEdit ? { label: "Edit", onSelect: onEdit } : null,
    onPromote ? { label: "Add to shared", onSelect: onPromote } : null,
    onUnshare ? { label: "Remove from shared", onSelect: onUnshare } : null,
    onDelete
      ? { label: "Delete", onSelect: onDelete, variant: "destructive" as const }
      : null,
  ].filter((action) => action !== null);

  return <RowActionsMenu label={name} size="sm" actions={actions} />;
}
