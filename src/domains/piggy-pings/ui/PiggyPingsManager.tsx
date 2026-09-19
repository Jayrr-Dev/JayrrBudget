"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PIGGY_ICON_NAMES,
  PiggyIcon,
  isPiggyIconName,
  type PiggyIconName,
} from "@/components/ui/piggy-icon";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageSpinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  budgetNameFromTrigger,
  budgetPingTrigger,
  triggerHasOver,
  triggerHasWarn,
  uniqueBudgetNames,
} from "@/domains/piggy-pings/domain/budgetPingTrigger";
import {
  resolveNextPingDate,
  toLocalYmd,
} from "@/domains/piggy-pings/domain/resolveNextPingDate";
import {
  CYCLE_PRESETS,
  DEFAULT_PING_TYPES,
  NONE_CYCLE,
  PING_TYPES,
  applyCycleDate,
  cycleDateToIso,
  cycleDisplay,
  isCycleDateValue,
  isCyclePresetOn,
  isNoneCycle,
  pingTypeLabel,
  toggleCyclePreset,
  togglePingType,
  type PingType,
} from "@/domains/piggy-pings/domain/types";
import { usePiggyPingRuntime } from "@/domains/piggy-pings/ui/PiggyPingRuntime";
import { formatDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "cn";
import { useMutation, useQuery } from "convex/react";
import { ChevronDownIcon, Info } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

type PingRow = {
  id: Id<"piggyPings">;
  name: string;
  title: string;
  message: string;
  icon: string;
  pingType: PingType;
  pingTypes: PingType[];
  cycle: string;
  trigger: string | null;
  triggerCount: number;
  firedKeys: string[];
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: number;
  ownerLabel: string;
};

function pingIconName(value: string | null | undefined): PiggyIconName {
  if (value && isPiggyIconName(value)) return value;
  return "pings";
}

function dateLabel(value: string | null) {
  if (!value) return "Indefinite";
  return formatDisplayDate(value);
}

function nextPingLabel(ping: PingRow) {
  const next = resolveNextPingDate({
    cycle: ping.cycle,
    startDate: ping.startDate,
    endDate: ping.endDate,
    createdAt: ping.createdAt,
  });
  if (next.kind === "trigger") return "On trigger";
  if (next.kind === "ended") return "Ended";
  if (next.kind === "none") return "None";
  return formatDisplayDate(next.ymd);
}

function pingTypeList(ping: PingRow): PingType[] {
  return ping.pingTypes.length > 0 ? ping.pingTypes : [ping.pingType];
}

function copyName(name: string) {
  const suffix = " (copy)";
  if (name.endsWith(suffix)) {
    return name.slice(0, 80);
  }
  return `${name}${suffix}`.slice(0, 80);
}

function CycleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-11 sm:size-5 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
          aria-label="About cycle"
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Cycle</PopoverTitle>
          <PopoverDescription>
            When the ping repeats, counted from the start date.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>None: no calendar repeat. Budget links can still fire it</li>
            <li>Combine any other chips; they save as a comma list</li>
            <li>Weekly: every 7 days</li>
            <li>Mon or Mon,Tue: those weekdays each week</li>
            <li>9/16: that month-day every year</li>
            <li>9/16/26: that one calendar day</li>
            <li>
              Monthly: same day each month. No start date means first fire is
              next month, not today
            </li>
            <li>EOM: last day of the month</li>
            <li>SOM: first day of the month</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function CycleChip({
  label,
  pressed,
  disabled,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      {label}
    </Button>
  );
}

function PingTriggerPicker({
  names,
  value,
  disabled,
  onChange,
}: {
  names: readonly string[];
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedName = budgetNameFromTrigger(value);
  const warn = triggerHasWarn(value);
  const over = triggerHasOver(value);
  const hasValue = Boolean(value.trim());

  function apply(name: string, nextWarn: boolean, nextOver: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    if (!nextWarn && !nextOver) {
      onChange("");
      return;
    }
    onChange(budgetPingTrigger(trimmed, nextWarn, nextOver));
  }

  if (names.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No budget triggers yet</p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-9 w-full justify-between gap-2 px-3 font-normal"
        >
          {hasValue ? (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="min-w-0 truncate">{selectedName}</span>
              <span className="flex shrink-0 gap-1">
                {warn ? <Badge variant="outline">Warn</Badge> : null}
                {over ? <Badge variant="outline">Over</Badge> : null}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select trigger</span>
          )}
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Select trigger
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 sm:size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                  aria-label="Trigger info"
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="z-[100] w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
              >
                <PopoverHeader className="gap-1.5">
                  <PopoverTitle>Trigger</PopoverTitle>
                  <PopoverDescription>
                    Pick a budget, then Warn, Over, or both.
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>One budget at a time</li>
                    <li>Warn fires at the warning mark</li>
                    <li>
                      Over fires at the overage mark, with or without Warn
                    </li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pick a budget and Warn, Over, or both.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-20 max-h-[min(16rem,40dvh)] overflow-hidden pr-3">
          <ul className="grid gap-1">
            {names.map((name) => {
              const selected =
                selectedName.toLowerCase() === name.toLowerCase() && hasValue;
              return (
                <li
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-lg px-1 py-1"
                >
                  <span className="min-w-0 truncate font-medium" title={name}>
                    {name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <CycleChip
                      label="Warn"
                      pressed={selected && warn}
                      disabled={disabled}
                      onToggle={() =>
                        apply(
                          name,
                          selected ? !warn : true,
                          selected ? over : false,
                        )
                      }
                    />
                    <CycleChip
                      label="Over"
                      pressed={selected && over}
                      disabled={disabled}
                      onToggle={() =>
                        apply(
                          name,
                          selected ? warn : false,
                          selected ? !over : true,
                        )
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CycleDateChip({
  cycle,
  disabled,
  onPick,
}: {
  cycle: string;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const dateOn = isCycleDateValue(cycle);

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(cycleDateToIso(cycle));
    }
    setOpen(next);
  }

  function apply() {
    if (!draft) {
      return;
    }
    onPick(applyCycleDate(cycle, draft));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant={dateOn ? "default" : "outline"}
          aria-pressed={dateOn}
          disabled={disabled}
        >
          Date
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Cycle date
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 sm:size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                  aria-label="Cycle date info"
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-72">
                <PopoverHeader>
                  <PopoverTitle>Cycle date</PopoverTitle>
                  <PopoverDescription>
                    One calendar day for this ping.
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>Saves as 9/16/26 for that one day</li>
                    <li>Edit the cycle field to 9/16 to repeat yearly</li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Enter a month, day, and year for this ping cycle.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="ping-cycle-date">Date</Label>
          <Input
            id="ping-cycle-date"
            type="date"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!draft} onClick={apply}>
            Use date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useDeliverPingTest(ping: PingRow) {
  const { deliver } = usePiggyPingRuntime();
  return () => {
    deliver({
      title: ping.title,
      message: ping.message,
      pingTypes: pingTypeList(ping),
      icon: ping.icon,
      tone: "default",
    });
  };
}

function PingActions({ ping }: { ping: PingRow }) {
  const remove = useMutation(api.piggyPings.remove);
  const createPing = useMutation(api.piggyPings.create);
  const updatePing = useMutation(api.piggyPings.update);
  const handleTest = useDeliverPingTest(ping);
  const [editOpen, setEditOpen] = useState(false);

  async function handleToggleActive() {
    try {
      await updatePing({ pingId: ping.id, isActive: !ping.isActive });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDuplicate() {
    try {
      await createPing({
        name: copyName(ping.name),
        title: ping.title,
        message: ping.message,
        icon: pingIconName(ping.icon),
        pingType: pingTypeList(ping)[0] ?? ping.pingType,
        pingTypes: pingTypeList(ping),
        cycle: ping.cycle,
        trigger: ping.trigger,
        startDate: ping.startDate,
        endDate: ping.endDate,
        notes: ping.notes,
        isActive: ping.isActive,
      });
      toast.success("Ping duplicated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    }
  }

  async function handleDelete() {
    try {
      await remove({ pingId: ping.id });
      toast.success("Ping removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <RowActionsMenu
        label={ping.name}
        size="sm"
        actions={[
          { label: "Test", onSelect: () => handleTest() },
          { label: "Edit", onSelect: () => setEditOpen(true) },
          {
            label: ping.isActive ? "Deactivate" : "Activate",
            onSelect: () => void handleToggleActive(),
          },
          { label: "Duplicate", onSelect: () => void handleDuplicate() },
          {
            label: "Delete",
            onSelect: () => void handleDelete(),
            variant: "destructive",
          },
        ]}
      />
      <PingFormDialog open={editOpen} onOpenChange={setEditOpen} ping={ping} />
    </>
  );
}

function PingIconPicker({ ping }: { ping: PingRow }) {
  const updatePing = useMutation(api.piggyPings.update);
  const [open, setOpen] = useState(false);
  const current = pingIconName(ping.icon);

  async function selectIcon(name: PiggyIconName) {
    setOpen(false);
    if (name === current) return;
    try {
      await updatePing({ pingId: ping.id, icon: name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update icon");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle transition-colors hover:bg-accent-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Change icon for ${ping.name}`}
          title="Change icon"
        >
          <PiggyIcon name={current} className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-auto max-w-[calc(100vw-2rem)] gap-0 p-2"
      >
        <PopoverHeader className="sr-only">
          <PopoverTitle>Choose icon</PopoverTitle>
          <PopoverDescription>
            Pick artwork for this ping from the Piggy icon set.
          </PopoverDescription>
        </PopoverHeader>
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-7">
          {PIGGY_ICON_NAMES.map((name) => {
            const selected = name === current;
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={selected}
                title={name}
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
                onClick={() => void selectIcon(name)}
              >
                <PiggyIcon name={name} className="size-5" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PingCard({ ping }: { ping: PingRow }) {
  const types = pingTypeList(ping);
  const created = formatDisplayDate(toLocalYmd(new Date(ping.createdAt)));

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-2.5">
          <PingIconPicker ping={ping} />
          <div className="min-w-0">
            <CardTitle className="truncate text-[20px] leading-tight font-semibold">
              {ping.name}
            </CardTitle>
            <CardDescription className="truncate">{ping.title}</CardDescription>
          </div>
        </div>
        <CardAction>
          <PingActions ping={ping} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid flex-1 gap-3">
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {ping.message}
        </p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              Cycle
              <CycleInfo />
            </dt>
            <dd className="min-w-0 truncate font-medium">
              {cycleDisplay(ping.cycle)}
            </dd>
          </div>
          {ping.trigger ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Trigger</dt>
              <dd className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">
                  {budgetNameFromTrigger(ping.trigger)}
                </span>
                <span className="flex shrink-0 gap-1">
                  {triggerHasWarn(ping.trigger) ? (
                    <Badge variant="outline">Warn</Badge>
                  ) : null}
                  {triggerHasOver(ping.trigger) ? (
                    <Badge variant="outline">Over</Badge>
                  ) : null}
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Ping Type(s)</dt>
            <dd className="flex flex-wrap gap-1">
              {types.map((type) => (
                <Badge key={type} variant="outline">
                  {pingTypeLabel(type)}
                </Badge>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Start</dt>
            <dd className="font-medium">{dateLabel(ping.startDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">End</dt>
            <dd className="font-medium">{dateLabel(ping.endDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Count</dt>
            <dd className="font-medium tabular-nums">{ping.triggerCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium">{created}</dd>
          </div>
          {ping.notes ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="line-clamp-2">{ping.notes}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-3">
        <span className="text-muted-foreground">Next</span>
        <span className="font-medium">{nextPingLabel(ping)}</span>
      </CardFooter>
    </Card>
  );
}

const PING_FORM_STEPS = [
  { id: 1, title: "What to send" },
  { id: 2, title: "When it fires" },
  { id: 3, title: "Options" },
] as const;

type PingFormStep = (typeof PING_FORM_STEPS)[number]["id"];

function PingFormDialog({
  open,
  onOpenChange,
  ping,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ping?: PingRow;
  trigger?: ReactNode;
}) {
  const createPing = useMutation(api.piggyPings.create);
  const updatePing = useMutation(api.piggyPings.update);
  const budgets = useQuery(api.budgets.list, {});
  const isEdit = Boolean(ping);
  const formId = ping ? `edit-ping-form-${ping.id}` : "create-ping-form";
  const [step, setStep] = useState<PingFormStep>(1);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pingTypes, setPingTypes] = useState<PingType[]>(DEFAULT_PING_TYPES);
  const [cycle, setCycle] = useState("Weekly");
  const [eventTrigger, setEventTrigger] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const stepMeta = PING_FORM_STEPS[step - 1];
  const triggerNames = useMemo(() => {
    const fromBudgets = uniqueBudgetNames(
      (budgets ?? []).map((budget) => budget.name),
    );
    const current = budgetNameFromTrigger(eventTrigger);
    if (
      current &&
      !fromBudgets.some((name) => name.toLowerCase() === current.toLowerCase())
    ) {
      return [current, ...fromBudgets];
    }
    return fromBudgets;
  }, [budgets, eventTrigger]);

  function resetForm() {
    setStep(1);
    setName("");
    setTitle("");
    setMessage("");
    setPingTypes(DEFAULT_PING_TYPES);
    setCycle("Weekly");
    setEventTrigger("");
    setStartDate("");
    setEndDate("");
    setNotes("");
    setIsActive(true);
  }

  function hydrate(row: PingRow) {
    setStep(1);
    setName(row.name);
    setTitle(row.title);
    setMessage(row.message);
    setPingTypes(row.pingTypes.length > 0 ? row.pingTypes : [row.pingType]);
    setCycle(cycleDisplay(row.cycle));
    setEventTrigger(row.trigger ?? "");
    setStartDate(row.startDate ?? "");
    setEndDate(row.endDate ?? "");
    setNotes(row.notes ?? "");
    setIsActive(row.isActive);
  }

  useEffect(() => {
    if (!open) return;
    if (ping) {
      hydrate(ping);
      return;
    }
    resetForm();
    // Seed once when the dialog opens so live list updates do not wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!next && !submitting) {
      resetForm();
    }
    onOpenChange(next);
  }

  function stepError(current: PingFormStep) {
    if (current === 1) {
      if (!name.trim() || !title.trim() || !message.trim()) {
        return "Name, title, and message are required";
      }
      return null;
    }
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const error = stepError(step);
    if (error) {
      toast.error(error);
      return;
    }
    if (step < 3) {
      setStep((step + 1) as PingFormStep);
      return;
    }

    const savedCycle = cycle.trim() || NONE_CYCLE;
    setSubmitting(true);
    try {
      if (ping) {
        await updatePing({
          pingId: ping.id,
          name,
          title,
          message,
          pingTypes,
          cycle: savedCycle,
          trigger: eventTrigger.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          notes: notes.trim() || null,
          isActive,
        });
      } else {
        await createPing({
          name,
          title,
          message,
          pingTypes,
          cycle: savedCycle,
          startDate: startDate || null,
          endDate: endDate || null,
          notes: notes.trim() || null,
          trigger: eventTrigger.trim() || null,
          isActive,
        });
      }
      resetForm();
      onOpenChange(false);
      toast.success(ping ? "Ping updated" : "Ping saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save ping");
    } finally {
      setSubmitting(false);
    }
  }

  const nextDisabled =
    submitting ||
    (step === 1 && (!name.trim() || !title.trim() || !message.trim()));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? "Edit ping" : "New ping"}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 sm:size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                  aria-label={isEdit ? "About edit ping" : "About new ping"}
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                className="z-[100] w-80 max-h-[min(24rem,calc(100dvh-2rem))] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-3.5"
              >
                <PopoverHeader className="gap-1.5">
                  <PopoverTitle>
                    {isEdit ? "Edit ping" : "New ping"}
                  </PopoverTitle>
                  <PopoverDescription>
                    {isEdit
                      ? "Change this reminder, then save."
                      : "Save a reminder for you, or one Jev can also create in chat."}
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>
                      Toast, email, dialog, and banner. Pick one or more. Toast
                      is the default
                    </li>
                    <li>Cycle from the start date</li>
                    <li>Blank start or end means that side never closes</li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Edit this reminder name, title, message, type, and cycle."
              : "Save a reminder with a name, title, message, type, and cycle."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{stepMeta?.title}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Step {step} of {PING_FORM_STEPS.length}
            </p>
          </div>
          <div className="flex gap-1" aria-hidden="true">
            {PING_FORM_STEPS.map((item) => (
              <span
                key={item.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  item.id <= step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>
        <form
          id={formId}
          onSubmit={(e) => void onSubmit(e)}
          className="grid min-h-0 flex-1 gap-3 overflow-x-hidden overflow-y-auto"
        >
          {step === 1 ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-name`}>Name</Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rent reminder"
                  maxLength={80}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-title`}>Title</Label>
                <Input
                  id={`${formId}-title`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Pay rent"
                  maxLength={160}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-message`}>Message</Label>
                <Textarea
                  id={`${formId}-message`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Rent is due tomorrow."
                  maxLength={2000}
                  rows={3}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Ping type</Label>
                <div className="flex flex-wrap gap-1">
                  {PING_TYPES.map((type) => (
                    <CycleChip
                      key={type}
                      label={pingTypeLabel(type)}
                      pressed={pingTypes.includes(type)}
                      disabled={submitting}
                      onToggle={() =>
                        setPingTypes(togglePingType(pingTypes, type))
                      }
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div className="grid gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor={`${formId}-cycle`}>Cycle</Label>
                  <CycleInfo />
                </div>
                <Input
                  id={`${formId}-cycle`}
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                  placeholder="Weekly, Mon,Tue, 9/16, EOM"
                  maxLength={80}
                  required
                  disabled={submitting}
                />
                <div className="flex flex-wrap gap-1">
                  {CYCLE_PRESETS.map((preset) => (
                    <CycleChip
                      key={preset}
                      label={preset}
                      pressed={isCyclePresetOn(cycle, preset)}
                      disabled={submitting}
                      onToggle={() =>
                        setCycle(toggleCyclePreset(cycle, preset))
                      }
                    />
                  ))}
                  <CycleDateChip
                    cycle={cycle}
                    disabled={submitting || isNoneCycle(cycle)}
                    onPick={setCycle}
                  />
                </div>
              </div>
              {isNoneCycle(cycle) ? (
                <div className="grid gap-1.5">
                  <Label>Trigger</Label>
                  <PingTriggerPicker
                    names={triggerNames}
                    value={eventTrigger}
                    disabled={submitting || budgets === undefined}
                    onChange={setEventTrigger}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${formId}-start`}>Start date</Label>
                  <Input
                    id={`${formId}-start`}
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${formId}-end`}>End date</Label>
                  <Input
                    id={`${formId}-end`}
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${formId}-active`}>Active</Label>
                <Switch
                  id={`${formId}-active`}
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(Boolean(checked))}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-notes`}>Notes</Label>
                <Textarea
                  id={`${formId}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  maxLength={2000}
                  rows={2}
                  className="overflow-hidden"
                  disabled={submitting}
                />
              </div>
            </>
          ) : null}
        </form>
        <DialogFooter>
          {step === 1 ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setStep((step - 1) as PingFormStep)}
            >
              Back
            </Button>
          )}
          <Button type="submit" form={formId} disabled={nextDisabled}>
            {step < 3 ? "Next" : submitting ? "Saving…" : "Save ping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <PingFormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button type="button" className="shrink-0">
          Create ping
        </Button>
      }
    />
  );
}

export function PiggyPingsManager({
  onCreatePing,
}: {
  onCreatePing: () => void;
}) {
  const pings = useQuery(api.piggyPings.list, {});
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!pings) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return pings as PingRow[];
    return (pings as PingRow[]).filter((ping) => {
      const haystack = [
        ping.name,
        ping.title,
        ping.message,
        ping.cycle,
        ping.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [pings, query]);

  if (pings === undefined) {
    return <PageSpinner className="min-h-40 py-8" />;
  }

  if (pings.length === 0) {
    return (
      <EmptyPrompt
        className="bg-surface py-10"
        title="No pings yet"
        description="Add a reminder here, or ask Jev to create one."
        action={
          <Button type="button" size="sm" onClick={onCreatePing}>
            Create ping
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter pings…"
          aria-label="Filter pings"
          className="max-w-sm"
        />
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          Showing {filtered.length} of {pings.length}
        </p>
      </div>
      {filtered.length === 0 ? (
        <EmptyPrompt
          className="bg-surface py-10"
          title="No matching pings"
          description="Try a different name, title, or message."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((ping) => (
            <li key={ping.id} className="h-full">
              <PingCard ping={ping} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
