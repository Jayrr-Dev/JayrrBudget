"use client";

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
  type PingType,
} from "@/domains/piggy-pings/domain/types";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

type PingRow = {
  id: Id<"piggyPings">;
  name: string;
  title: string;
  message: string;
  pingType: PingType;
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

  async function handleDelete() {
    try {
      await remove({ pingId: ping.id });
      toast.success("Ping removed");
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
  columnHelper.accessor("ownerLabel", {
    header: "Person",
    cell: ({ getValue }) => (
      <span className="block truncate text-sm">{String(getValue())}</span>
    ),
    meta: { width: "8rem", nowrap: true },
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
  columnHelper.accessor("pingType", {
    header: "Type",
    cell: ({ getValue }) => (
      <Badge variant="outline">{String(getValue())}</Badge>
    ),
    meta: { width: "6.5rem", nowrap: true },
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
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => <PingActions ping={row.original} />,
    meta: { label: "Actions", width: "5.5rem", nowrap: true },
  }),
]);

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-control-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/50";

function CreatePingForm() {
  const createPing = useMutation(api.piggyPings.create);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pingType, setPingType] = useState<PingType>("Toast");
  const [cycle, setCycle] = useState("Weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createPing({
        name,
        title,
        message,
        pingType,
        cycle,
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes.trim() || null,
        trigger: null,
        isActive,
      });
      setName("");
      setTitle("");
      setMessage("");
      setNotes("");
      setIsActive(true);
      toast.success("Ping saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save ping");
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
        New ping
      </h2>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ping-name">Name</Label>
          <Input
            id="ping-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rent reminder"
            maxLength={80}
            required
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ping-title">Title</Label>
          <Input
            id="ping-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pay rent"
            maxLength={160}
            required
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ping-message">Message</Label>
          <Textarea
            id="ping-message"
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
          <Label htmlFor="ping-type">Ping type</Label>
          <select
            id="ping-type"
            className={SELECT_CLASS}
            value={pingType}
            onChange={(e) => setPingType(e.target.value as PingType)}
            disabled={submitting}
          >
            {PING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ping-cycle">Cycle</Label>
            <CycleInfo />
          </div>
          <Input
            id="ping-cycle"
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
                onToggle={() => setCycle(toggleCyclePreset(cycle, preset))}
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
            <Label htmlFor="ping-start">Start date</Label>
            <Input
              id="ping-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ping-end">End date</Label>
            <Input
              id="ping-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="ping-active">Active</Label>
          <Switch
            id="ping-active"
            checked={isActive}
            onCheckedChange={(checked) => setIsActive(Boolean(checked))}
            disabled={submitting}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ping-notes">Notes</Label>
          <Textarea
            id="ping-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            maxLength={2000}
            rows={2}
            disabled={submitting}
          />
        </div>
        <Button
          type="submit"
          disabled={
            submitting ||
            !name.trim() ||
            !title.trim() ||
            !message.trim() ||
            !cycle.trim()
          }
        >
          {submitting ? "Saving…" : "Save ping"}
        </Button>
      </div>
    </form>
  );
}

export function PiggyPingsManager() {
  const pings = useQuery(api.piggyPings.list, {});

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <CreatePingForm />
      </div>
      <div className="min-w-0 lg:col-span-2">
        {pings === undefined ? (
          <PageSpinner className="min-h-40 py-8" />
        ) : pings.length === 0 ? (
          <EmptyPrompt
            className="bg-[var(--surface)] py-10"
            title="No pings yet"
            description="Add a reminder here, or ask Piggy to create one."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() => document.getElementById("ping-name")?.focus()}
              >
                New ping
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={pings as PingRow[]}
            searchKey="name"
            searchPlaceholder="Filter pings…"
          />
        )}
      </div>
    </div>
  );
}
