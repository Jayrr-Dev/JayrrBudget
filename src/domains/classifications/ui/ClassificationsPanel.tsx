"use client";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Icon } from "@iconify/react";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

type Scope = "shared" | "user";
type Tab = "sections" | "categories" | "subcategories" | "tags";

type SectionRow = {
  id: string;
  name: string;
  description: string;
  categoryNames?: string[];
};

type CategoryRow = {
  id: string;
  name: string;
  description: string;
  sectionId: string | null;
  sectionName: string | null;
  subcategoryNames: string[];
};

type SubcategoryRow = {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  sectionName?: string | null;
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
const tagHelper = createColumnHelper<DataTableFeatures, SectionRow>();

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
    <span className="block truncate text-sm" title={names.join(", ")}>
      {names.join(", ")}
    </span>
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
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
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
            Shared is the starter pack you get. User is any extra label that is
            only yours.
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
              Subcategory is the specific flavor (Supermarket, Bars & Pubs,
              Audiobooks)
            </li>
            <li>Tag is an extra sticker that can sit on many kinds of spend</li>
            <li>Shared is the catalog every new user starts with</li>
            <li>User is any label you added that is not in shared</li>
            <li>
              You can change your copy of a shared label. That stays on your
              list
            </li>
            <li>Rename a shared label and it moves to User</li>
            {isAdmin ? (
              <li>
                Admins can add a liked user label to shared, or take one out
              </li>
            ) : null}
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

export function ClassificationsPanel() {
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
  const ensureUserTags = useMutation(api.classifications.ensureUserTags);
  const createTag = useMutation(api.classifications.createTag);
  const updateTag = useMutation(api.classifications.updateTag);
  const deleteTag = useMutation(api.classifications.deleteTag);

  const [scope, setScope] = useState<Scope>("shared");
  const [tab, setTab] = useState<Tab>("sections");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = catalog?.isAdmin ?? false;
  const isUserScope = scope === "user";
  const canEditOwn = isUserScope;
  const mine = catalog?.mine;

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

  function findMineTag(name: string) {
    return mine?.tags.find((row) => sameLabel(row.name, name));
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
    void ensureUserTags({});
  }, [repairHierarchy, ensureUserTags]);

  async function remove(
    kind: "section" | "category" | "subcategory" | "tag",
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
      } else if (kind === "subcategory") {
        await deleteSubcategory({
          id: id as Id<"transactionSubcategories">,
        });
      } else {
        await deleteTag({ id: id as Id<"transactionTags"> });
      }
      toast.success(`Deleted ${name}`);
    } catch (error) {
      toast.error(errorMessage(error, "Delete failed"));
    }
  }

  async function editSection(row: SectionRow) {
    if (isUserScope) {
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
    if (isUserScope) {
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
    if (isUserScope) {
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
    if (isUserScope) {
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
    if (isUserScope) {
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
    if (isUserScope) {
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

  async function editTag(row: SectionRow) {
    if (isUserScope) {
      setForm({
        tab: "tags",
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
        findMineTag(row.name) ??
        (await createTag({
          name: row.name,
          description: row.description,
        }));
      setForm({
        tab: "tags",
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

  async function deleteTagCopy(row: SectionRow) {
    if (isUserScope) {
      void remove("tag", row.id, row.name);
      return;
    }
    const mineRow = findMineTag(row.name);
    if (!mineRow) {
      toast.error("This starter label is not on your list yet");
      return;
    }
    void remove("tag", mineRow.id, mineRow.name, true);
  }

  async function promote(
    kind: "section" | "category" | "subcategory" | "tag",
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
        tagId: kind === "tag" ? (row.id as Id<"transactionTags">) : undefined,
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
    kind: "section" | "category" | "subcategory" | "tag",
    row: {
      name: string;
      sectionName?: string | null;
      categoryName?: string | null;
    },
  ) {
    const section =
      kind === "section" || kind === "tag" ? row.name : (row.sectionName ?? "");
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
          header: actionsHeader,
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editSection(row.original)}
                onDelete={() => void deleteSectionCopy(row.original)}
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
        sectionHelper.accessor("name", {
          header: "Section",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
          meta: { width: "11rem", nowrap: true },
        }),
        sectionHelper.accessor("categoryNames", {
          header: "Categories",
          cell: ({ getValue }) =>
            childNamesCell(getValue() ?? [], "No categories"),
          filterFn: (row, _columnId, filterValue) => {
            const names = row.original.categoryNames ?? [];
            const needle = String(filterValue ?? "")
              .trim()
              .toLowerCase();
            if (!needle) return true;
            return names.some((name) => name.toLowerCase().includes(needle));
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
        }),
      ]),
    [isAdmin, isUserScope, mine],
  );

  const categoryColumns = useMemo(
    () =>
      categoryHelper.columns([
        categoryHelper.display({
          id: "actions",
          header: actionsHeader,
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editCategory(row.original)}
                onDelete={() => void deleteCategoryCopy(row.original)}
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
        }),
        categoryHelper.accessor("subcategoryNames", {
          header: "Sub",
          cell: ({ getValue }) =>
            childNamesCell(getValue() ?? [], "Needs a subcategory"),
          filterFn: (row, _columnId, filterValue) => {
            const names = row.original.subcategoryNames ?? [];
            const needle = String(filterValue ?? "")
              .trim()
              .toLowerCase();
            if (!needle) return true;
            return names.some((name) => name.toLowerCase().includes(needle));
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
        }),
      ]),
    [isAdmin, isUserScope, mine],
  );

  const subcategoryColumns = useMemo(
    () =>
      subcategoryHelper.columns([
        subcategoryHelper.display({
          id: "actions",
          header: actionsHeader,
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editSubcategory(row.original)}
                onDelete={() => void deleteSubcategoryCopy(row.original)}
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
        }),
      ]),
    [isAdmin, isUserScope, mine],
  );

  const tagColumns = useMemo(
    () =>
      tagHelper.columns([
        tagHelper.display({
          id: "actions",
          header: actionsHeader,
          cell: ({ row }) => (
            <div className="flex items-center justify-center">
              <RowActions
                name={row.original.name}
                onEdit={() => void editTag(row.original)}
                onDelete={() => void deleteTagCopy(row.original)}
                onPromote={
                  isUserScope && isAdmin
                    ? () => void promote("tag", row.original)
                    : undefined
                }
                onUnshare={
                  !isUserScope && isAdmin
                    ? () => void unshare("tag", row.original)
                    : undefined
                }
              />
            </div>
          ),
          enableSorting: false,
          enableHiding: true,
          meta: { label: "Actions", width: "2rem" },
        }),
        tagHelper.accessor("name", {
          header: "Tag",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
          meta: { width: "11rem" },
        }),
        tagHelper.accessor("description", {
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
        }),
      ]),
    [isAdmin, isUserScope, mine],
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
      } else if (form.mode === "create") {
        await createTag({ name, description: form.description });
      } else if (form.id) {
        await updateTag({
          id: form.id as Id<"transactionTags">,
          name,
          description: form.description,
        });
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
        : tab === "subcategories"
          ? "subcategory"
          : "tag";

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
    };
  });

  const own = catalog?.userOnly;
  const userCategories = (own?.categories ?? []).map((row) => ({
    ...row,
    subcategoryNames: row.subcategoryNames ?? [],
  }));
  const userSections = (own?.sections ?? []).map((row) => ({
    ...row,
    categoryNames: userCategories
      .filter((category) => sameLabel(category.sectionName ?? "", row.name))
      .map((category) => category.name),
  }));
  const userSubs = own?.subcategories ?? [];
  const sharedTags = (catalog?.shared.tags ?? []).map((row) => {
    const mineRow = findMineTag(row.name);
    return {
      id: mineRow?.id ?? row.name,
      name: row.name,
      description: mineRow?.description ?? row.description,
    };
  });
  const userTags = own?.tags ?? [];

  const sections = isUserScope ? userSections : sharedSections;
  const categories = isUserScope ? userCategories : sharedCategories;
  const subcategories = isUserScope ? userSubs : sharedSubs;
  const tags = isUserScope ? userTags : sharedTags;

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
        <h1 className="type-page flex items-center gap-2">
          Classifications
          <TitleInfo isAdmin={isAdmin} />
        </h1>
      </header>

      {catalog === undefined ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Loading classifications…
        </p>
      ) : (
        <div className="space-y-4">
          <ButtonGroup>
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

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as Tab)}
            className="gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <TabsList>
                <TabsTrigger value="sections">Sections</TabsTrigger>
                <TabsTrigger value="categories">Categories</TabsTrigger>
                <TabsTrigger value="subcategories">Subcategories</TabsTrigger>
                <TabsTrigger value="tags">Tags</TabsTrigger>
              </TabsList>
              {canEditOwn ? (
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
                <p className="text-sm text-[var(--muted-foreground)]">
                  {isUserScope
                    ? "No user-only sections. Names that match shared stay under Shared."
                    : "No shared sections yet."}
                </p>
              ) : (
                <DataTable
                  columns={sectionColumns}
                  data={sections}
                  searchKey="name"
                  searchPlaceholder="Filter sections…"
                  filters={sectionFilters}
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={`${scope}-sections.csv`}
                />
              )}
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              {categories.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  {isUserScope
                    ? "No user-only categories. Names that match shared stay under Shared."
                    : "No shared categories yet."}
                </p>
              ) : (
                <DataTable
                  columns={categoryColumns}
                  data={categories}
                  searchKey="name"
                  searchPlaceholder="Filter categories…"
                  filters={categoryFilters}
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={`${scope}-categories.csv`}
                />
              )}
            </TabsContent>

            <TabsContent value="subcategories" className="space-y-4">
              {subcategories.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  {isUserScope
                    ? "No user-only subcategories. Names that match shared stay under Shared."
                    : "No shared subcategories yet."}
                </p>
              ) : (
                <DataTable
                  columns={subcategoryColumns}
                  data={subcategories}
                  searchKey="name"
                  searchPlaceholder="Filter subcategories…"
                  filters={subcategoryFilters}
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={`${scope}-subcategories.csv`}
                />
              )}
            </TabsContent>

            <TabsContent value="tags" className="space-y-4">
              {tags.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  {isUserScope
                    ? "No user-only tags. Names that match shared stay under Shared."
                    : "No shared tags yet."}
                </p>
              ) : (
                <DataTable
                  columns={tagColumns}
                  data={tags}
                  searchKey="name"
                  searchPlaceholder="Filter tags…"
                  pageSize={25}
                  enableColumnToggle
                  csvFilename={`${scope}-tags.csv`}
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
            className="flex flex-col gap-4 overflow-visible sm:max-w-lg"
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
                      : form.tab === "subcategories"
                        ? "subcategory"
                        : "tag"}
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
                    form.tab === "sections" || form.tab === "tags"
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

function actionsHeader() {
  return (
    <span className="flex items-center justify-center">
      <Icon
        icon="mynaui:mouse-pointer-click-solid"
        className="size-4 text-[var(--muted-foreground)]"
        aria-hidden
      />
      <span className="sr-only">Actions</span>
    </span>
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label={`Actions for ${name}`}
      >
        <Icon icon="basil:menu-outline" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36">
        {onEdit ? (
          <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
            Edit
          </DropdownMenuItem>
        ) : null}
        {onPromote ? (
          <DropdownMenuItem className="cursor-pointer" onClick={onPromote}>
            Add to shared
          </DropdownMenuItem>
        ) : null}
        {onUnshare ? (
          <DropdownMenuItem className="cursor-pointer" onClick={onUnshare}>
            Remove from shared
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onClick={onDelete}
          >
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
