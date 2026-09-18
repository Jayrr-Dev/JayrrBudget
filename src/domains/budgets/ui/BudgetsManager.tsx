"use client";

import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
import { Switch } from "@/components/ui/switch";
import { classifyCashFlow } from "@/domains/analysis/domain/cashFlow";
import {
  BUDGET_CYCLE_LABELS,
  BUDGET_CYCLES,
  toBudgetYmd,
  todayBudgetYmd,
  type BudgetCycle,
} from "@/domains/budgets/domain/budgetCycle";
import {
  buildBudgetProgressItems,
  type BudgetSpendLine,
} from "@/domains/budgets/domain/budgetProgress";
import { BudgetProgressCards } from "@/domains/budgets/ui/BudgetProgressCards";
import { ClassLookupCombobox } from "@/domains/budgets/ui/ClassLookupCombobox";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { formatCompactDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

type ClassCatalog = {
  sections: { name: string }[];
  categories: { name: string }[];
  subcategories: { name: string }[];
};

type BudgetRow = {
  id: Id<"budgets">;
  name: string;
  classLookup: string | null;
  descriptionLookup: string | null;
  lookupTable: string;
  amount: number;
  warningThreshold: number;
  overageThreshold: number;
  isActive: boolean;
  cycle: BudgetCycle;
  startDate: string;
  createdAt: number;
  updatedAt: number;
};

function lookupTableLabel(
  catalog: ClassCatalog | undefined,
  classLookup: string | null,
): string {
  const value = classLookup?.trim().toLowerCase() ?? "";
  if (!value || !catalog) return "—";
  const has = (rows: { name: string }[]) =>
    rows.some((row) => row.name.trim().toLowerCase() === value);
  if (has(catalog.subcategories)) return "Subcategory";
  if (has(catalog.categories)) return "Category";
  if (has(catalog.sections)) return "Section";
  return "Custom";
}

function FieldLabel({
  htmlFor,
  children,
  infoTitle,
  infoBody,
}: {
  htmlFor: string;
  children: ReactNode;
  infoTitle: string;
  infoBody: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
            aria-label={`About ${infoTitle}`}
          >
            <Info className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
        >
          <PopoverHeader className="gap-1.5">
            <PopoverTitle>{infoTitle}</PopoverTitle>
            <PopoverDescription>{infoBody}</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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

function BudgetsBulkActions({ budgets }: { budgets: BudgetRow[] }) {
  const remove = useMutation(api.budgets.remove);
  const [busy, setBusy] = useState(false);

  async function deleteBulk() {
    if (budgets.length === 0) return;
    const ok = window.confirm(
      `Delete ${budgets.length} visible budget${budgets.length === 1 ? "" : "s"}?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      for (const budget of budgets) {
        await remove({ budgetId: budget.id });
      }
      toast.success(
        budgets.length === 1
          ? "Budget removed"
          : `${budgets.length} budgets removed`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const actions: RowActionsMenuItem[] = [
    {
      label: "Delete visible",
      onSelect: () => void deleteBulk(),
      disabled: busy || budgets.length === 0,
      variant: "destructive",
    },
  ];

  return (
    <BulkActionsMenu
      label="visible budgets"
      actions={actions}
      disabled={busy || budgets.length === 0}
    />
  );
}

function BudgetActions({ budget }: { budget: BudgetRow }) {
  const remove = useMutation(api.budgets.remove);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    try {
      await remove({ budgetId: budget.id });
      toast.success("Budget removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex items-center justify-center">
      <RowActionsMenu
        label={budget.name}
        size="sm"
        actions={[
          { label: "Edit", onSelect: () => setEditOpen(true) },
          {
            label: "Delete",
            onSelect: () => void handleDelete(),
            variant: "destructive",
          },
        ]}
      />
      <BudgetDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        budget={budget}
      />
    </div>
  );
}

const columns = columnHelper.columns([
  columnHelper.accessor("isActive", {
    header: "Active",
    cell: ({ row }) => <ActiveToggle budget={row.original} />,
    enableSorting: false,
    meta: { label: "Active", width: "4.25rem", keepOpaque: true },
  }),
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
    meta: { width: "7.5rem", nowrap: true, cardTitle: true },
  }),
  columnHelper.accessor("classLookup", {
    header: "Class lookup",
    cell: ({ getValue }) => (
      <span className="block truncate text-sm">
        {getValue() ? String(getValue()) : "—"}
      </span>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.accessor("lookupTable", {
    header: "Lookup table",
    cell: ({ getValue }) => (
      <span className="block truncate text-sm">{String(getValue())}</span>
    ),
    meta: { width: "7.5rem", nowrap: true },
  }),
  columnHelper.accessor("descriptionLookup", {
    header: "Desc. lookup",
    cell: ({ getValue }) => (
      <span
        className="block truncate text-sm text-[var(--muted-foreground)]"
        title={getValue() ? String(getValue()) : ""}
      >
        {getValue() ? String(getValue()) : "—"}
      </span>
    ),
    meta: { width: "7.5rem", nowrap: true },
  }),
  columnHelper.accessor("amount", {
    header: "Amount",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">
        {money.format(Number(getValue()))}
      </span>
    ),
    meta: { width: "6.5rem", nowrap: true },
  }),
  columnHelper.accessor("cycle", {
    header: "Cycle",
    cell: ({ getValue }) => (
      <span className="text-sm">
        {BUDGET_CYCLE_LABELS[getValue() as BudgetCycle] ?? String(getValue())}
      </span>
    ),
    meta: { width: "5.75rem", nowrap: true },
  }),
  columnHelper.accessor("startDate", {
    header: "Start",
    cell: ({ getValue }) => (
      <span className="text-sm">
        {formatCompactDisplayDate(String(getValue()))}
      </span>
    ),
    meta: { width: "6.5rem", nowrap: true },
  }),
  columnHelper.accessor("warningThreshold", {
    header: "Warn %",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">{Number(getValue())}</span>
    ),
    meta: { width: "4.5rem", nowrap: true },
  }),
  columnHelper.accessor("overageThreshold", {
    header: "Over %",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">{Number(getValue())}</span>
    ),
    meta: { width: "4.5rem", nowrap: true },
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => (
      <span className="text-xs text-[var(--muted-foreground)]">
        {formatCompactDisplayDate(toBudgetYmd(new Date(Number(getValue()))))}
      </span>
    ),
    meta: { width: "6.5rem", nowrap: true },
  }),
  columnHelper.accessor("updatedAt", {
    header: "Updated",
    cell: ({ getValue }) => (
      <span className="text-xs text-[var(--muted-foreground)]">
        {formatCompactDisplayDate(toBudgetYmd(new Date(Number(getValue()))))}
      </span>
    ),
    meta: { width: "6.5rem", nowrap: true },
  }),
  columnHelper.display({
    id: "actions",
    header: ({ table }) => (
      <BudgetsBulkActions
        budgets={table.getRowModel().rows.map((row) => row.original)}
      />
    ),
    cell: ({ row }) => <BudgetActions budget={row.original} />,
    enableSorting: false,
    enableHiding: false,
    meta: { label: "Actions", width: "2.5rem", keepOpaque: true },
  }),
]);

function BudgetForm({
  budget,
  onSaved,
}: {
  budget?: BudgetRow;
  onSaved?: () => void;
}) {
  const createBudget = useMutation(api.budgets.create);
  const updateBudget = useMutation(api.budgets.update);
  const catalog = useQuery(api.classifications.list, {});
  const fieldId = budget ? `budget-${budget.id}` : "budget";
  const [name, setName] = useState(budget?.name ?? "");
  const [classLookup, setClassLookup] = useState(budget?.classLookup ?? "");
  const [descriptionLookup, setDescriptionLookup] = useState(
    budget?.descriptionLookup ?? "",
  );
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "");
  const [cycle, setCycle] = useState<BudgetCycle>(budget?.cycle ?? "monthly");
  const [startDate, setStartDate] = useState(
    budget?.startDate || todayBudgetYmd(),
  );
  const [warningThreshold, setWarningThreshold] = useState(
    budget ? String(budget.warningThreshold) : "80",
  );
  const [overageThreshold, setOverageThreshold] = useState(
    budget ? String(budget.overageThreshold) : "100",
  );
  const [isActive, setIsActive] = useState(budget?.isActive ?? true);
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
      const payload = {
        name,
        amount: parsedAmount,
        classLookup: classLookup || null,
        descriptionLookup: descriptionLookup.trim() || null,
        warningThreshold: Number.isFinite(warn) ? warn : 80,
        overageThreshold: Number.isFinite(over) ? over : 100,
        isActive,
        cycle,
        startDate,
      };
      if (budget) {
        await updateBudget({ budgetId: budget.id, ...payload });
        toast.success("Budget updated");
      } else {
        await createBudget(payload);
        toast.success("Budget saved");
      }
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save budget");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-name`}>Name</Label>
          <Input
            id={`${fieldId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Groceries"
            maxLength={80}
            required
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-class`}>Class lookup</Label>
          <ClassLookupCombobox
            id={`${fieldId}-class`}
            catalog={catalog}
            value={classLookup}
            disabled={submitting}
            onChange={setClassLookup}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-description`}>Description lookup</Label>
          <Input
            id={`${fieldId}-description`}
            value={descriptionLookup}
            onChange={(e) => setDescriptionLookup(e.target.value)}
            placeholder="Optional merchant or description"
            maxLength={160}
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-amount`}>Amount</Label>
          <Input
            id={`${fieldId}-amount`}
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
            <FieldLabel
              htmlFor={`${fieldId}-cycle`}
              infoTitle="Cycle"
              infoBody="The cap applies to this slice, then resets."
            >
              Cycle
            </FieldLabel>
            <NativeSelect
              id={`${fieldId}-cycle`}
              className="w-full"
              value={cycle}
              disabled={submitting}
              onChange={(e) => setCycle(e.target.value as BudgetCycle)}
            >
              {BUDGET_CYCLES.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {BUDGET_CYCLE_LABELS[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <FieldLabel
              htmlFor={`${fieldId}-start`}
              infoTitle="Start date"
              infoBody="Each slice lines up from this day."
            >
              Start date
            </FieldLabel>
            <Input
              id={`${fieldId}-start`}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-warn`}>Warning %</Label>
            <Input
              id={`${fieldId}-warn`}
              type="number"
              min="0"
              step="1"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-over`}>Overage %</Label>
            <Input
              id={`${fieldId}-over`}
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
          <Label htmlFor={`${fieldId}-active`}>Active</Label>
          <Switch
            id={`${fieldId}-active`}
            checked={isActive}
            onCheckedChange={(checked) => setIsActive(Boolean(checked))}
            disabled={submitting}
          />
        </div>
        <Button
          type="submit"
          disabled={submitting || !name.trim() || !amount.trim()}
        >
          {submitting ? "Saving…" : budget ? "Save changes" : "Save budget"}
        </Button>
      </div>
    </form>
  );
}

export function BudgetDialog({
  open,
  onOpenChange,
  budget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: BudgetRow;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{budget ? "Edit budget" : "New budget"}</DialogTitle>
          <DialogDescription className="sr-only">
            {budget
              ? "Adjust the spend cap, lookups, cycle, or start date."
              : "Set a spend cap, cycle, and start date."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <BudgetForm budget={budget} onSaved={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CreateBudgetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <BudgetDialog open={open} onOpenChange={onOpenChange} />;
}

export function BudgetsManager({ onNewBudget }: { onNewBudget?: () => void }) {
  const budgets = useQuery(api.budgets.list, {});
  const catalog = useQuery(api.classifications.list, {});
  const privateLedger = usePrivateLedger();
  const rows = useMemo(() => {
    if (!budgets) return [];
    return budgets.map((budget) => ({
      ...budget,
      lookupTable: lookupTableLabel(catalog, budget.classLookup),
      startDate: budget.startDate || toBudgetYmd(new Date(budget.createdAt)),
    }));
  }, [budgets, catalog]);

  const progressItems = useMemo(() => {
    if (!rows.length) return [];
    const accountTypeById = new Map(
      privateLedger.ledger.accounts.map((account) => [
        account.accountId,
        account.type ?? null,
      ]),
    );
    const lines: BudgetSpendLine[] = [];
    for (const txn of privateLedger.ledger.transactions) {
      const kind = classifyCashFlow({
        amountMinor: Math.round(txn.amount * 100),
        description: txn.description,
        accountType: txn.accountId
          ? (accountTypeById.get(txn.accountId) ?? null)
          : null,
        sectionName: txn.sectionName ?? null,
        categoryName: txn.categoryName ?? null,
        typeName: txn.transactionTypeName ?? null,
        transactionCode: txn.txnCode ?? null,
      });
      if (kind !== "spend") continue;
      lines.push({
        date: txn.date,
        amount: txn.amount,
        description: txn.description,
        merchantName: txn.merchantName,
        merchantClean: txn.merchantClean,
        sectionName: txn.sectionName,
        categoryName: txn.categoryName,
        subcategoryName: txn.subcategoryName,
        spreadName: txn.spreadName,
        transactionTypeName: txn.transactionTypeName,
      });
    }
    return buildBudgetProgressItems(rows, lines);
  }, [rows, privateLedger.ledger]);

  return (
    <div className="grid gap-4">
      <BudgetProgressCards items={progressItems} />
      {budgets === undefined ? (
        <PageSpinner className="min-h-40 py-8" />
      ) : rows.length === 0 ? (
        <EmptyPrompt
          className="bg-[var(--surface)] py-10"
          title="No budgets yet"
          description="Add a spend cap here, or ask Piggy to create one."
          action={
            <Button type="button" size="sm" onClick={onNewBudget}>
              New budget
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows as BudgetRow[]}
          searchKey="name"
          searchPlaceholder="Filter budgets…"
          csvFilename="budgets.csv"
          enableColumnToggle
          initialColumnVisibility={{ id: false }}
          rowMuted={(row) => !row.isActive}
        />
      )}
    </div>
  );
}
