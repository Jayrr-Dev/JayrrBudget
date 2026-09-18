"use client";

import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
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
import { BudgetProgressBars } from "@/domains/budgets/ui/BudgetProgressBars";
import { ClassLookupCombobox } from "@/domains/budgets/ui/ClassLookupCombobox";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { formatDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
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
  cycle: BudgetCycle;
  startDate: string;
  createdAt: number;
  updatedAt: number;
};

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
          {
            label: "Delete",
            onSelect: () => void handleDelete(),
            variant: "destructive",
          },
        ]}
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
  columnHelper.accessor("cycle", {
    header: "Cycle",
    cell: ({ getValue }) => (
      <span className="text-sm">
        {BUDGET_CYCLE_LABELS[getValue() as BudgetCycle] ?? String(getValue())}
      </span>
    ),
    meta: { width: "7.5rem", nowrap: true },
  }),
  columnHelper.accessor("startDate", {
    header: "Start",
    cell: ({ getValue }) => (
      <span className="text-sm font-mono">
        {formatDisplayDate(String(getValue()))}
      </span>
    ),
    meta: { width: "8.5rem", nowrap: true },
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

function CreateBudgetForm() {
  const createBudget = useMutation(api.budgets.create);
  const catalog = useQuery(api.classifications.list, {});
  const [name, setName] = useState("");
  const [classLookup, setClassLookup] = useState("");
  const [descriptionLookup, setDescriptionLookup] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<BudgetCycle>("monthly");
  const [startDate, setStartDate] = useState(todayBudgetYmd);
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
        cycle,
        startDate,
      });
      setName("");
      setClassLookup("");
      setDescriptionLookup("");
      setAmount("");
      setCycle("monthly");
      setStartDate(todayBudgetYmd());
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
            <FieldLabel
              htmlFor="budget-cycle"
              infoTitle="Cycle"
              infoBody="The cap applies to this slice, then resets."
            >
              Cycle
            </FieldLabel>
            <NativeSelect
              id="budget-cycle"
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
              htmlFor="budget-start"
              infoTitle="Start date"
              infoBody="Each slice lines up from this day."
            >
              Start date
            </FieldLabel>
            <Input
              id="budget-start"
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
  const privateLedger = usePrivateLedger();
  const rows = useMemo(() => {
    if (!budgets) return [];
    return budgets.map((budget) => ({
      ...budget,
      startDate: budget.startDate || toBudgetYmd(new Date(budget.createdAt)),
    }));
  }, [budgets]);

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
      <BudgetProgressBars items={progressItems} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CreateBudgetForm />
        </div>
        <div className="min-w-0 lg:col-span-2">
          {budgets === undefined ? (
            <PageSpinner className="min-h-40 py-8" />
          ) : rows.length === 0 ? (
            <EmptyPrompt
              className="bg-[var(--surface)] py-10"
              title="No budgets yet"
              description="Add a spend cap here, or ask Piggy to create one."
              action={
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    document.getElementById("budget-name")?.focus()
                  }
                >
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
              initialColumnVisibility={{ id: false }}
              rowMuted={(row) => !row.isActive}
            />
          )}
        </div>
      </div>
    </div>
  );
}
