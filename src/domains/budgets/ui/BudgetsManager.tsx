"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageSpinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ClassLookupCombobox } from "@/domains/budgets/ui/ClassLookupCombobox";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

type BudgetRow = {
  id: Id<"budgets">;
  name: string;
  classLookup: string | null;
  descriptionLookup: string | null;
  amount: number;
  warningThreshold: number;
  overageThreshold: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

const columnHelper = createColumnHelper<DataTableFeatures, BudgetRow>();

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

function ActiveToggle({ budget }: { budget: BudgetRow }) {
  const updateBudget = useMutation(api.budgets.update);

  async function handleChange(checked: boolean) {
    try {
      await updateBudget({ budgetId: budget.id, isActive: checked });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <Switch
      size="sm"
      checked={budget.isActive}
      onCheckedChange={(checked) => void handleChange(Boolean(checked))}
      aria-label={budget.isActive ? "Deactivate budget" : "Activate budget"}
    />
  );
}

function BudgetActions({ budget }: { budget: BudgetRow }) {
  const remove = useMutation(api.budgets.remove);

  async function handleDelete() {
    try {
      await remove({ budgetId: budget.id });
      toast.success("Budget removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="destructive"
      onClick={() => void handleDelete()}
    >
      Delete
    </Button>
  );
}

const columns = columnHelper.columns([
  columnHelper.accessor("id", {
    header: "Id",
    cell: ({ getValue }) => (
      <span
        className="block max-w-[7rem] truncate font-mono text-xs"
        title={String(getValue())}
      >
        {String(getValue())}
      </span>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: ({ getValue }) => (
      <span className="block truncate font-medium">{String(getValue())}</span>
    ),
    meta: { width: "8rem", nowrap: true, grow: true },
  }),
  columnHelper.accessor("classLookup", {
    header: "Class",
    cell: ({ getValue }) => (
      <span className="block truncate text-sm">
        {getValue() ? String(getValue()) : "—"}
      </span>
    ),
    meta: { width: "9rem", nowrap: true },
  }),
  columnHelper.accessor("descriptionLookup", {
    header: "Description",
    cell: ({ getValue }) => (
      <span
        className="block truncate text-sm text-[var(--muted-foreground)]"
        title={getValue() ? String(getValue()) : ""}
      >
        {getValue() ? String(getValue()) : "—"}
      </span>
    ),
    meta: { width: "10rem", nowrap: true },
  }),
  columnHelper.accessor("amount", {
    header: "Amount",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">
        {money.format(Number(getValue()))}
      </span>
    ),
    meta: { width: "7rem", nowrap: true },
  }),
  columnHelper.accessor("warningThreshold", {
    header: "Warn %",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">{Number(getValue())}</span>
    ),
    meta: { width: "5.5rem", nowrap: true },
  }),
  columnHelper.accessor("overageThreshold", {
    header: "Over %",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">{Number(getValue())}</span>
    ),
    meta: { width: "5.5rem", nowrap: true },
  }),
  columnHelper.accessor("isActive", {
    header: "Active",
    cell: ({ row }) => <ActiveToggle budget={row.original} />,
    meta: { width: "5.5rem", nowrap: true },
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => (
      <span className="text-xs text-[var(--muted-foreground)]">
        {new Date(Number(getValue())).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.accessor("updatedAt", {
    header: "Updated",
    cell: ({ getValue }) => (
      <span className="text-xs text-[var(--muted-foreground)]">
        {new Date(Number(getValue())).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => <BudgetActions budget={row.original} />,
    meta: { label: "Actions", width: "5.5rem", nowrap: true },
  }),
]);

function CreateBudgetForm() {
  const createBudget = useMutation(api.budgets.create);
  const catalog = useQuery(api.classifications.list, {});
  const [name, setName] = useState("");
  const [classLookup, setClassLookup] = useState("");
  const [descriptionLookup, setDescriptionLookup] = useState("");
  const [amount, setAmount] = useState("");
  const [warningThreshold, setWarningThreshold] = useState("80");
  const [overageThreshold, setOverageThreshold] = useState("100");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount);
    const warn = Number(warningThreshold);
    const over = Number(overageThreshold);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Amount must be zero or more");
      return;
    }
    setSubmitting(true);
    try {
      await createBudget({
        name,
        amount: parsedAmount,
        classLookup: classLookup || null,
        descriptionLookup: descriptionLookup.trim() || null,
        warningThreshold: Number.isFinite(warn) ? warn : 80,
        overageThreshold: Number.isFinite(over) ? over : 100,
        isActive,
      });
      setName("");
      setClassLookup("");
      setDescriptionLookup("");
      setAmount("");
      setWarningThreshold("80");
      setOverageThreshold("100");
      setIsActive(true);
      toast.success("Budget saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save budget");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h2 className="font-heading text-base font-semibold tracking-tight">
        New budget
      </h2>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="budget-name">Name</Label>
          <Input
            id="budget-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Groceries"
            maxLength={80}
            required
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="budget-class">Class lookup</Label>
          <ClassLookupCombobox
            id="budget-class"
            catalog={catalog}
            value={classLookup}
            disabled={submitting}
            onChange={setClassLookup}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="budget-description">Description lookup</Label>
          <Input
            id="budget-description"
            value={descriptionLookup}
            onChange={(e) => setDescriptionLookup(e.target.value)}
            placeholder="Optional merchant or description"
            maxLength={160}
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="budget-amount">Amount</Label>
          <Input
            id="budget-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="400"
            required
            disabled={submitting}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="budget-warn">Warning %</Label>
            <Input
              id="budget-warn"
              type="number"
              min="0"
              step="1"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="budget-over">Overage %</Label>
            <Input
              id="budget-over"
              type="number"
              min="0"
              step="1"
              value={overageThreshold}
              onChange={(e) => setOverageThreshold(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="budget-active">Active</Label>
          <Switch
            id="budget-active"
            checked={isActive}
            onCheckedChange={(checked) => setIsActive(Boolean(checked))}
            disabled={submitting}
          />
        </div>
        <Button
          type="submit"
          disabled={submitting || !name.trim() || !amount.trim()}
        >
          {submitting ? "Saving…" : "Save budget"}
        </Button>
      </div>
    </form>
  );
}

export function BudgetsManager() {
  const budgets = useQuery(api.budgets.list, {});

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <CreateBudgetForm />
      </div>
      <div className="min-w-0 lg:col-span-2">
        {budgets === undefined ? (
          <PageSpinner className="min-h-40 py-8" />
        ) : budgets.length === 0 ? (
          <EmptyPrompt
            className="bg-[var(--surface)] py-10"
            title="No budgets yet"
            description="Add a spend cap here, or ask Piggy to create one."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() => document.getElementById("budget-name")?.focus()}
              >
                New budget
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={budgets as BudgetRow[]}
            searchKey="name"
            searchPlaceholder="Filter budgets…"
          />
        )}
      </div>
    </div>
  );
}
