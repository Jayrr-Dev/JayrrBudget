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
import {
  BUDGET_CYCLE_LABELS,
  BUDGET_CYCLES,
  toBudgetYmd,
  todayBudgetYmd,
  type BudgetCycle,
} from "@/domains/budgets/domain/budgetCycle";
import { BudgetPingLinksField, type BudgetPingLinkDraft } from "@/domains/budgets/ui/BudgetPingLinksField";
import { BudgetProgressCards } from "@/domains/budgets/ui/BudgetProgressCards";
import { ClassLookupCombobox } from "@/domains/budgets/ui/ClassLookupCombobox";
import {
  useBudgetProgressItems,
  type BudgetTableRow,
} from "@/domains/budgets/ui/useBudgetProgressItems";
import { budgetPingCopy } from "@/domains/piggy-pings/domain/budgetPingCopy";
import {
  DEFAULT_PING_TYPES,
  PING_TYPES,
  pingTypeLabel,
  type PingType,
} from "@/domains/piggy-pings/domain/types";
import { usePiggyPingRuntime } from "@/domains/piggy-pings/ui/PiggyPingRuntime";
import { formatCompactDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

type BudgetRow = BudgetTableRow;

function FieldLabel({
  htmlFor,
  children,
  infoTitle,
  infoBody,
  infoItems,
}: {
  htmlFor: string;
  children: ReactNode;
  infoTitle: string;
  infoBody: string;
  infoItems?: string[];
}) {
  const items = infoItems ?? [];
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
            {items.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
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
      toast.success(checked ? "Budget active" : "Budget deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Switch
        size="sm"
        checked={budget.isActive}
        onCheckedChange={(checked) => void handleChange(Boolean(checked))}
        aria-label={budget.isActive ? "Deactivate budget" : "Activate budget"}
      />
      <span className="text-[10px] leading-none text-muted-foreground">
        {budget.isActive ? "Active" : "Deactivated"}
      </span>
    </div>
  );
}

function ClassLookupCell({ budget }: { budget: BudgetRow }) {
  const catalog = useQuery(api.classifications.list, {});
  const updateBudget = useMutation(api.budgets.update);
  const [busy, setBusy] = useState(false);

  async function handleChange(next: string) {
    const classLookup = next.trim() ? next.trim() : null;
    if ((budget.classLookup ?? null) === classLookup) return;
    setBusy(true);
    try {
      await updateBudget({ budgetId: budget.id, classLookup });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (catalog === undefined) {
    return (
      <span className="block truncate text-sm">
        {budget.classLookup ? budget.classLookup : "—"}
      </span>
    );
  }

  return (
    <ClassLookupCombobox
      variant="cell"
      catalog={catalog}
      value={budget.classLookup ?? ""}
      disabled={busy}
      aria-label={`Class lookup for ${budget.name}`}
      onChange={(next) => void handleChange(next)}
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
  const pings = useQuery(api.piggyPings.list, {});
  const { deliver } = usePiggyPingRuntime();
  const [editOpen, setEditOpen] = useState(false);

  function handleTest(tone: "warn" | "over") {
    const warn = tone === "warn";
    const over = tone === "over";
    const linked = (pings ?? []).filter((ping) =>
      budget.pingLinks.some((link) => {
        if (link.pingId !== ping.id) return false;
        if (over) return link.over;
        return link.warn;
      }),
    );
    if (linked.length > 0) {
      for (const ping of linked) {
        const types =
          ping.pingTypes.length > 0 ? ping.pingTypes : DEFAULT_PING_TYPES;
        deliver({
          title: ping.title,
          message: ping.message,
          pingTypes: types,
          icon: ping.icon,
          tone,
        });
      }
      return;
    }
    const copy = budgetPingCopy(budget.name, warn, over);
    deliver({
      title: copy.title,
      message: copy.message,
      pingTypes: DEFAULT_PING_TYPES,
      tone,
    });
  }

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
          { label: "Test warn", onSelect: () => handleTest("warn") },
          { label: "Test over", onSelect: () => handleTest("over") },
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
    header: () => (
      <span className="flex w-full items-center justify-center">Status</span>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <ActiveToggle budget={row.original} />
      </div>
    ),
    enableSorting: false,
    meta: { label: "Status", width: "5.5rem", keepOpaque: true },
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
    cell: ({ row }) => <ClassLookupCell budget={row.original} />,
    meta: { width: "9rem", nowrap: true },
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
  columnHelper.display({
    id: "pingLinks",
    header: "Ping attached",
    cell: ({ row }) => <PingAttachedCell links={row.original.pingLinks} />,
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

const BUDGET_FORM_STEPS = [
  { id: "basics", label: "Basics" },
  { id: "thresholds", label: "Thresholds" },
  { id: "review", label: "Review" },
] as const;

type BudgetFormStepId = (typeof BUDGET_FORM_STEPS)[number]["id"];

function nextBudgetFormStep(step: BudgetFormStepId): BudgetFormStepId {
  if (step === "basics") return "thresholds";
  return "review";
}

function previousBudgetFormStep(
  step: BudgetFormStepId,
): BudgetFormStepId | null {
  if (step === "thresholds") return "basics";
  if (step === "review") return "thresholds";
  return null;
}

function budgetAmountError(amount: string): string | null {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return "Amount must be zero or more";
  }
  return null;
}

function displayOrDash(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return trimmed;
}

function percentLabel(value: string, fallback: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${fallback}%`;
  return `${parsed}%`;
}

function linkedPingLabel(count: number): string {
  if (count === 0) return "None";
  if (count === 1) return "1 linked";
  return `${count} linked`;
}

function defaultPingTypeLabel(): string {
  const first = DEFAULT_PING_TYPES[0] ?? "Toast";
  return pingTypeLabel(first);
}

function attachedPingTypeLabel(
  links: { pingId: string }[],
  pings:
    | { id: string; pingTypes: PingType[] }[]
    | undefined,
): string {
  if (links.length === 0) return defaultPingTypeLabel();
  if (!pings) return linkedPingLabel(links.length);
  const selected = new Set<PingType>();
  for (const link of links) {
    const ping = pings.find((row) => row.id === link.pingId);
    const types = ping?.pingTypes ?? DEFAULT_PING_TYPES;
    for (const type of types) {
      selected.add(type);
    }
  }
  const labels = PING_TYPES.filter((type) => selected.has(type)).map(
    pingTypeLabel,
  );
  if (labels.length === 0) return defaultPingTypeLabel();
  return labels.join(", ");
}

function PingAttachedCell({
  links,
}: {
  links: BudgetTableRow["pingLinks"];
}) {
  const pings = useQuery(api.piggyPings.list, {});
  return (
    <span className="text-xs text-muted-foreground">
      {attachedPingTypeLabel(links, pings)}
    </span>
  );
}

function BudgetFormStepper({ step }: { step: BudgetFormStepId }) {
  return (
    <nav aria-label="Budget steps">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {BUDGET_FORM_STEPS.map((item, index) => {
          const current = item.id === step;
          return (
            <li
              key={item.id}
              aria-current={current ? "step" : undefined}
              className={
                current
                  ? "rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                  : "px-1.5 py-1 text-muted-foreground"
              }
            >
              {index + 1}. {item.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BudgetReviewList({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <dl className="grid gap-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
          <dd
            className="min-w-0 truncate text-right font-medium"
            title={row.value}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

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
  const pings = useQuery(api.piggyPings.list, {});
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
  const [pingLinks, setPingLinks] = useState<BudgetPingLinkDraft[]>(
    budget?.pingLinks ?? [],
  );
  const [step, setStep] = useState<BudgetFormStepId>("basics");
  const [submitting, setSubmitting] = useState(false);
  const previousStep = previousBudgetFormStep(step);
  const basicsBlocked = !name.trim() || !amount.trim();
  const reviewRows = [
    { label: "Name", value: displayOrDash(name) },
    { label: "Class lookup", value: displayOrDash(classLookup) },
    { label: "Description", value: displayOrDash(descriptionLookup) },
    {
      label: "Amount",
      value: budgetAmountError(amount)
        ? displayOrDash(amount)
        : money.format(Number(amount)),
    },
    { label: "Cycle", value: BUDGET_CYCLE_LABELS[cycle] },
    { label: "Start date", value: formatCompactDisplayDate(startDate) },
    { label: "Warning", value: percentLabel(warningThreshold, 80) },
    { label: "Overage", value: percentLabel(overageThreshold, 100) },
    { label: "Piggy pings", value: attachedPingTypeLabel(pingLinks, pings) },
    { label: "Status", value: isActive ? "Active" : "Deactivated" },
  ];

  function goBack() {
    if (!previousStep) return;
    setStep(previousStep);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step !== "review") {
      if (step === "basics") {
        if (!name.trim()) {
          toast.error("Name the budget first");
          return;
        }
        const amountError = budgetAmountError(amount);
        if (amountError) {
          toast.error(amountError);
          return;
        }
      }
      setStep(nextBudgetFormStep(step));
      return;
    }

    const parsedAmount = Number(amount);
    const warn = Number(warningThreshold);
    const over = Number(overageThreshold);
    const amountError = budgetAmountError(amount);
    if (amountError) {
      toast.error(amountError);
      setStep("basics");
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
        pingLinks,
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
        <BudgetFormStepper step={step} />
        {step === "basics" ? (
          <>
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
          </>
        ) : null}
        {step === "thresholds" ? (
          <>
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
            <div className="grid gap-1.5">
              <FieldLabel
                htmlFor={`${fieldId}-pings`}
                infoTitle="Piggy pings"
                infoBody="These reminders save on the Piggy Pings page."
                infoItems={[
                  "Toast is the default. You can also pick Dialog, Email, or Banner.",
                  "Warn and Over use the same wording for every type.",
                  "Open Piggy Pings later if you want a custom message.",
                ]}
              >
                Piggy pings
              </FieldLabel>
              <BudgetPingLinksField
                budgetName={name}
                links={pingLinks}
                disabled={submitting}
                onChange={setPingLinks}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${fieldId}-active`}>
                {isActive ? "Active" : "Deactivated"}
              </Label>
              <Switch
                id={`${fieldId}-active`}
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(Boolean(checked))}
                disabled={submitting}
              />
            </div>
          </>
        ) : null}
        {step === "review" ? <BudgetReviewList rows={reviewRows} /> : null}
        <div className="flex items-center gap-2">
          {previousStep ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={goBack}
            >
              Back
            </Button>
          ) : null}
          {step === "review" ? (
            <Button
              className="ml-auto"
              type="submit"
              disabled={submitting || basicsBlocked}
            >
              {submitting ? "Saving…" : budget ? "Save changes" : "Save budget"}
            </Button>
          ) : (
            <Button
              className="ml-auto"
              type="submit"
              disabled={submitting || (step === "basics" ? basicsBlocked : false)}
            >
              Next
            </Button>
          )}
        </div>
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
              ? "Edit this budget in three steps: basics, thresholds, then review."
              : "Create a budget in three steps: basics, thresholds, then review."}
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
  const { budgets, rows, progressItems } = useBudgetProgressItems();

  return (
    <div className="grid gap-4">
      <BudgetProgressCards items={progressItems} />
      {budgets === undefined ? (
        <PageSpinner className="min-h-40 py-8" />
      ) : rows.length === 0 ? (
        <EmptyPrompt
          className="bg-[var(--surface)] py-10"
          title="No budgets yet"
          description="Add a spend cap here, or ask Jev to create one."
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
