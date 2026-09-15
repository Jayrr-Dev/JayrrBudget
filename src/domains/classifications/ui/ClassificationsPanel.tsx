"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

type Tab = "sections" | "categories" | "subcategories";

type SectionRow = {
  id: Id<"transactionSections">;
  name: string;
  description: string;
};

type CategoryRow = {
  id: Id<"transactionCategories">;
  name: string;
  description: string;
  sectionId: Id<"transactionSections"> | null;
  sectionName: string | null;
};

type SubcategoryRow = {
  id: Id<"transactionSubcategories">;
  name: string;
  description: string;
  categoryId: Id<"transactionCategories"> | null;
  categoryName: string | null;
};

type FormState = {
  tab: Tab;
  mode: "create" | "edit";
  id?: string;
  name: string;
  description: string;
  parentId: string;
};

const sectionHelper = createColumnHelper<DataTableFeatures, SectionRow>();
const categoryHelper = createColumnHelper<DataTableFeatures, CategoryRow>();
const subcategoryHelper = createColumnHelper<DataTableFeatures, SubcategoryRow>();

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function TitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
            Labels you apply to your own spending.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Sections are the top buckets</li>
            <li>Categories sit under a section</li>
            <li>Subcategories sit under a category</li>
            <li>Edits apply only to your ledger</li>
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
  };
}

export function ClassificationsPanel() {
  const data = useQuery(api.classifications.list, {});
  const createSection = useMutation(api.classifications.createSection);
  const updateSection = useMutation(api.classifications.updateSection);
  const deleteSection = useMutation(api.classifications.deleteSection);
  const createCategory = useMutation(api.classifications.createCategory);
  const updateCategory = useMutation(api.classifications.updateCategory);
  const deleteCategory = useMutation(api.classifications.deleteCategory);
  const createSubcategory = useMutation(api.classifications.createSubcategory);
  const updateSubcategory = useMutation(api.classifications.updateSubcategory);
  const deleteSubcategory = useMutation(api.classifications.deleteSubcategory);

  const [tab, setTab] = useState<Tab>("sections");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const sectionColumns = useMemo(
    () =>
      sectionHelper.columns([
        sectionHelper.accessor("name", {
          header: "Section",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
        }),
        sectionHelper.accessor("description", {
          header: "Description",
          cell: ({ getValue }) => (
            <span className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
              {getValue() || "-"}
            </span>
          ),
          filterFn: "includesString",
        }),
        sectionHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <RowActions
              onEdit={() =>
                setForm({
                  tab: "sections",
                  mode: "edit",
                  id: row.original.id,
                  name: row.original.name,
                  description: row.original.description,
                  parentId: "",
                })
              }
              onDelete={() =>
                void remove("section", row.original.id, row.original.name)
              }
            />
          ),
        }),
      ]),
    [],
  );

  const categoryColumns = useMemo(
    () =>
      categoryHelper.columns([
        categoryHelper.accessor("name", {
          header: "Category",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
        }),
        categoryHelper.accessor("sectionName", {
          header: "Section",
          cell: ({ getValue }) => (
            <span className="text-sm">{getValue() ?? "-"}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
        }),
        categoryHelper.accessor("description", {
          header: "Description",
          cell: ({ getValue }) => (
            <span className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
              {getValue() || "-"}
            </span>
          ),
          filterFn: "includesString",
        }),
        categoryHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <RowActions
              onEdit={() =>
                setForm({
                  tab: "categories",
                  mode: "edit",
                  id: row.original.id,
                  name: row.original.name,
                  description: row.original.description,
                  parentId: row.original.sectionId ?? "",
                })
              }
              onDelete={() =>
                void remove("category", row.original.id, row.original.name)
              }
            />
          ),
        }),
      ]),
    [],
  );

  const subcategoryColumns = useMemo(
    () =>
      subcategoryHelper.columns([
        subcategoryHelper.accessor("name", {
          header: "Subcategory",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
        }),
        subcategoryHelper.accessor("categoryName", {
          header: "Category",
          cell: ({ getValue }) => (
            <span className="text-sm">{getValue() ?? "-"}</span>
          ),
          filterFn: "includesString",
          sortFn: "text",
        }),
        subcategoryHelper.accessor("description", {
          header: "Description",
          cell: ({ getValue }) => (
            <span className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
              {getValue() || "-"}
            </span>
          ),
          filterFn: "includesString",
        }),
        subcategoryHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <RowActions
              onEdit={() =>
                setForm({
                  tab: "subcategories",
                  mode: "edit",
                  id: row.original.id,
                  name: row.original.name,
                  description: row.original.description,
                  parentId: row.original.categoryId ?? "",
                })
              }
              onDelete={() =>
                void remove(
                  "subcategory",
                  row.original.id,
                  row.original.name,
                )
              }
            />
          ),
        }),
      ]),
    [],
  );

  async function remove(
    kind: "section" | "category" | "subcategory",
    id: string,
    name: string,
  ) {
    const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
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
        if (form.mode === "create") {
          await createCategory({
            name,
            description: form.description,
            sectionId,
          });
        } else if (form.id) {
          await updateCategory({
            id: form.id as Id<"transactionCategories">,
            name,
            description: form.description,
            sectionId,
          });
        }
      } else {
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

  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          Classifications
          <TitleInfo />
        </h1>
      </header>

      {data === undefined ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Loading classifications…
        </p>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="subcategories">Subcategories</TabsTrigger>
            </TabsList>
            <Button
              type="button"
              size="sm"
              onClick={() => setForm(emptyForm(tab))}
            >
              Add {noun}
            </Button>
          </div>

          <TabsContent value="sections" className="space-y-3">
            {data.sections.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No sections yet.
              </p>
            ) : (
              <DataTable
                columns={sectionColumns}
                data={data.sections}
                searchKey="name"
                searchPlaceholder="Filter sections…"
                pageSize={25}
                enableColumnToggle
                csvFilename="sections.csv"
              />
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-3">
            {data.categories.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No categories yet.
              </p>
            ) : (
              <DataTable
                columns={categoryColumns}
                data={data.categories}
                searchKey="name"
                searchPlaceholder="Filter categories…"
                pageSize={25}
                enableColumnToggle
                csvFilename="categories.csv"
              />
            )}
          </TabsContent>

          <TabsContent value="subcategories" className="space-y-3">
            {data.subcategories.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No subcategories yet.
              </p>
            ) : (
              <DataTable
                columns={subcategoryColumns}
                data={data.subcategories}
                searchKey="name"
                searchPlaceholder="Filter subcategories…"
                pageSize={25}
                enableColumnToggle
                csvFilename="subcategories.csv"
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => {
        if (!open) setForm(null);
      }}>
        {form ? (
          <DialogContent className="sm:max-w-md" showCloseButton>
            <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
              <DialogHeader>
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
                    {(data?.sections ?? []).map((section) => (
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
                    {(data?.categories ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.sectionName
                          ? `${category.sectionName} / ${category.name}`
                          : category.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label htmlFor="classification-description">Description</Label>
                <Textarea
                  id="classification-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  rows={3}
                />
              </div>
              <DialogFooter>
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
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button type="button" size="xs" variant="outline" onClick={onEdit}>
        Edit
      </Button>
      <Button type="button" size="xs" variant="destructive" onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
