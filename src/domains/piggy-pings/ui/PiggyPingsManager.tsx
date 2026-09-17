"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
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
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { PageSpinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CYCLE_PRESETS,
  PING_TYPES,
  applyCycleDate,
  cycleDateToIso,
  isCycleDateValue,
  isCyclePresetOn,
  toggleCyclePreset,
  togglePingType,
  type PingType,
} from "@/domains/piggy-pings/domain/types";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Icon } from "@iconify/react";
import { createColumnHelper } from "@tanstack/react-table";
import { cn } from "cn";
import { useMutation, useQuery } from "convex/react";
import { Info, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type PingRow = {
  id: Id<"piggyPings">;
  name: string;
  title: string;
  message: string;
  pingType: PingType;
  pingTypes: PingType[];
  cycle: string;
  trigger: string | null;
  triggerCount: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: number;
  ownerLabel: string;
};

const columnHelper = createColumnHelper<DataTableFeatures, PingRow>();

function dateLabel(value: string | null) {
  if (!value) return "Indefinite";
  return value;
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
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
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
        className="w-80 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Cycle</PopoverTitle>
          <PopoverDescription>
            When the ping repeats, counted from the start date.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Combine any chips; they save as a comma list</li>
            <li>Weekly: every 7 days</li>
            <li>Mon or Mon,Tue: those weekdays each week</li>
            <li>9/16: that month-day every year</li>
            <li>9/16/26: that one calendar day</li>
            <li>Monthly: same day of the month as start</li>
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
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
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

function ActiveToggle({ ping }: { ping: PingRow }) {
  const updatePing = useMutation(api.piggyPings.update);

  async function handleChange(checked: boolean) {
    try {
      await updatePing({ pingId: ping.id, isActive: checked });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <Switch
      size="sm"
      checked={ping.isActive}
      onCheckedChange={(checked) => void handleChange(Boolean(checked))}
      aria-label={ping.isActive ? "Deactivate ping" : "Activate ping"}
    />
  );
}

function PingActions({ ping }: { ping: PingRow }) {
  const remove = useMutation(api.piggyPings.remove);
  const createPing = useMutation(api.piggyPings.create);
  const [editOpen, setEditOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);

  function handleTest() {
    const types = ping.pingTypes.length > 0 ? ping.pingTypes : [ping.pingType];
    for (const type of types) {
      if (type === "Popup") {
        setPopupOpen(true);
        continue;
      }
      if (type === "Banner") {
        setBannerOpen(true);
        continue;
      }
      if (type === "Email") {
        toast.info(ping.title, {
          description: `${ping.message}\n\nEmail send is not wired yet. This is the preview.`,
          duration: 8000,
        });
        continue;
      }
      toast.message(ping.title, {
        description: ping.message,
        duration: 8000,
      });
    }
  }

  async function handleDuplicate() {
    try {
      await createPing({
        name: copyName(ping.name),
        title: ping.title,
        message: ping.message,
        pingType: ping.pingTypes[0] ?? ping.pingType,
        pingTypes: ping.pingTypes,
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
          { label: "Test", onSelect: handleTest },
          { label: "Edit", onSelect: () => setEditOpen(true) },
          { label: "Duplicate", onSelect: () => void handleDuplicate() },
          {
            label: "Delete",
            onSelect: () => void handleDelete(),
            variant: "destructive",
          },
        ]}
      />
      <PingFormDialog open={editOpen} onOpenChange={setEditOpen} ping={ping} />
      <AlertDialog open={popupOpen} onOpenChange={setPopupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ping.title}</AlertDialogTitle>
            <AlertDialogDescription>{ping.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Dismiss</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {bannerOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3">
              <Alert className="pointer-events-auto w-full max-w-xl shadow-lg">
                <AlertTitle>{ping.title}</AlertTitle>
                <AlertDescription>{ping.message}</AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Dismiss banner"
                    onClick={() => setBannerOpen(false)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </AlertAction>
              </Alert>
            </div>,
            document.body,
          )
        : null}
    </>
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

const columns = columnHelper.columns([
  columnHelper.display({
    id: "actions",
    header: actionsHeader,
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <PingActions ping={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: true,
    meta: { label: "Actions", width: "2rem" },
  }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: ({ getValue }) => (
      <span className="block truncate font-medium">{String(getValue())}</span>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.accessor("title", {
    header: "Title",
    cell: ({ getValue }) => (
      <span className="block truncate">{String(getValue())}</span>
    ),
    meta: { width: "10rem", nowrap: true, grow: true },
  }),
  columnHelper.accessor("message", {
    header: "Message",
    cell: ({ getValue }) => (
      <span
        className="block truncate text-sm text-[var(--muted-foreground)]"
        title={String(getValue())}
      >
        {String(getValue())}
      </span>
    ),
    meta: { width: "12rem", nowrap: true },
  }),
  columnHelper.accessor("isActive", {
    header: "Active",
    cell: ({ row }) => <ActiveToggle ping={row.original} />,
    meta: { width: "5.5rem", nowrap: true },
  }),
  columnHelper.accessor("pingTypes", {
    header: "Type",
    cell: ({ row, getValue }) => {
      const types = (getValue() as PingType[] | undefined) ?? [];
      const shown = types.length > 0 ? types : [row.original.pingType];
      return (
        <span className="flex flex-wrap gap-1">
          {shown.map((type) => (
            <Badge key={type} variant="outline">
              {type}
            </Badge>
          ))}
        </span>
      );
    },
    meta: { width: "9rem", nowrap: true },
  }),
  columnHelper.accessor("cycle", {
    header: () => (
      <span className="inline-flex items-center gap-1">
        Cycle
        <CycleInfo />
      </span>
    ),
    cell: ({ getValue }) => (
      <span className="block truncate text-sm">{String(getValue())}</span>
    ),
    meta: { width: "7rem", nowrap: true },
  }),
  columnHelper.accessor("trigger", {
    header: "Trigger",
    cell: ({ getValue }) => (
      <span className="text-sm text-[var(--muted-foreground)]">
        {getValue() ? String(getValue()) : "—"}
      </span>
    ),
    meta: { width: "6rem", nowrap: true },
  }),
  columnHelper.accessor("triggerCount", {
    header: "Count",
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums">{Number(getValue())}</span>
    ),
    meta: { width: "5rem", nowrap: true },
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
  columnHelper.accessor("startDate", {
    header: "Start",
    cell: ({ getValue }) => (
      <span className="text-sm">{dateLabel(getValue() as string | null)}</span>
    ),
    meta: { width: "7rem", nowrap: true },
  }),
  columnHelper.accessor("endDate", {
    header: "End",
    cell: ({ getValue }) => (
      <span className="text-sm">{dateLabel(getValue() as string | null)}</span>
    ),
    meta: { width: "7rem", nowrap: true },
  }),
  columnHelper.accessor("notes", {
    header: "Notes",
    cell: ({ getValue }) => (
      <span
        className="block truncate text-sm text-[var(--muted-foreground)]"
        title={getValue() ? String(getValue()) : ""}
      >
        {getValue() ? String(getValue()) : "—"}
      </span>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
]);

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
  const isEdit = Boolean(ping);
  const formId = ping ? `edit-ping-form-${ping.id}` : "create-ping-form";
  const [step, setStep] = useState<PingFormStep>(1);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pingTypes, setPingTypes] = useState<PingType[]>(["Toast"]);
  const [cycle, setCycle] = useState("Weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const stepMeta = PING_FORM_STEPS[step - 1];

  function resetForm() {
    setStep(1);
    setName("");
    setTitle("");
    setMessage("");
    setPingTypes(["Toast"]);
    setCycle("Weekly");
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
    setCycle(row.cycle);
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
    if (current === 2 && !cycle.trim()) {
      return "Cycle is required";
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

    setSubmitting(true);
    try {
      if (ping) {
        await updatePing({
          pingId: ping.id,
          name,
          title,
          message,
          pingTypes,
          cycle,
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
          cycle,
          startDate: startDate || null,
          endDate: endDate || null,
          notes: notes.trim() || null,
          trigger: null,
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
    (step === 1 && (!name.trim() || !title.trim() || !message.trim())) ||
    (step === 2 && !cycle.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? "Edit ping" : "New ping"}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                  aria-label={isEdit ? "About edit ping" : "About new ping"}
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
                  <PopoverTitle>
                    {isEdit ? "Edit ping" : "New ping"}
                  </PopoverTitle>
                  <PopoverDescription>
                    {isEdit
                      ? "Change this reminder, then save."
                      : "Save a reminder for you, or one Piggy can also create in chat."}
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>Toast, email, popup, and banner. Pick one or more</li>
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
          className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1"
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
                      label={type}
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
                    disabled={submitting}
                    onPick={setCycle}
                  />
                </div>
              </div>
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

  if (pings === undefined) {
    return <PageSpinner className="min-h-40 py-8" />;
  }

  if (pings.length === 0) {
    return (
      <EmptyPrompt
        className="bg-[var(--surface)] py-10"
        title="No pings yet"
        description="Add a reminder here, or ask Piggy to create one."
        action={
          <Button type="button" size="sm" onClick={onCreatePing}>
            Create ping
          </Button>
        }
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={pings as PingRow[]}
      searchKey="name"
      searchPlaceholder="Filter pings…"
    />
  );
}
