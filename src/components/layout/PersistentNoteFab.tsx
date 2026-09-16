"use client";

import { ChromeTab } from "@/components/layout/ChromeTab";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { LedgerAiChat } from "@/domains/ledger-ai/ui/LedgerAiChat";
import {
  PiggyMascot,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import {
  subscribeScratchNoteOpen,
  useScratchNote,
  useScratchNoteActions,
  useScratchNoteLocalMigration,
  type ScratchNoteTab,
} from "@/domains/scratch-note/scratchNoteStore";
import {
  useEnsureDefaultUserNote,
  useUserNotes,
  useUserNotesActions,
  type UserNoteRecord,
} from "@/domains/user-notes/userNotesStore";
import { cn } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/shared/lib/csv";
import {
  ChevronLeft,
  FileSpreadsheet,
  PlusIcon,
  StickyNote,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

function storeSheetCsvFilename(tabName: string) {
  const slug = tabName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "store-sheet"}.csv`;
}

const FAB_COLLAPSED_PX = 32;
const FAB_EXPANDED_ICON_ONLY_SEGMENT_PX = 28;
const FAB_EXPANDED_PILL_INNER_PADDING_PX = 8;
const FAB_EXPANDED_DUAL_SEGMENT_GAP_PX = 2;
const FAB_EXPANDED_BASE_PX = 56;
const FAB_EXPANDED_PIGGY_PX = 72;
const FAB_EXPANDED_EXTRA_PER_COUNT_DIGIT_PX = 6;
const FAB_EXPANDED_MAX_PX = 88;
const BADGE_CAP = 99;

const CORNER_BADGE_CLASS =
  "pointer-events-none absolute -top-0.5 -right-0.5 z-[1] flex min-h-3 min-w-3 items-center justify-center rounded-full border border-[var(--background)] bg-[var(--muted-foreground)] px-0.5 text-[9px] font-semibold leading-none text-[var(--background)] shadow-sm";

function formatBadge(value: number): string {
  const n = Math.max(0, Math.floor(value));
  return n > BADGE_CAP ? `${BADGE_CAP}+` : String(n);
}

function expandedSegmentWidthPx(count: number): number {
  const digits = String(Math.max(0, count)).length;
  const extra = Math.max(0, digits - 1) * FAB_EXPANDED_EXTRA_PER_COUNT_DIGIT_PX;
  return Math.min(FAB_EXPANDED_MAX_PX, FAB_EXPANDED_BASE_PX + extra);
}

function expandedPillWidthPx(
  sheetCount: number,
  noteCount: number,
  sheetOpen: boolean,
  notesOpen: boolean,
  aiOpen: boolean,
): number {
  const sheetPx = sheetOpen
    ? expandedSegmentWidthPx(sheetCount)
    : FAB_EXPANDED_ICON_ONLY_SEGMENT_PX;
  const notePx = notesOpen
    ? expandedSegmentWidthPx(noteCount)
    : FAB_EXPANDED_ICON_ONLY_SEGMENT_PX;
  const aiPx = aiOpen
    ? FAB_EXPANDED_PIGGY_PX
    : FAB_EXPANDED_ICON_ONLY_SEGMENT_PX;
  return (
    FAB_EXPANDED_PILL_INNER_PADDING_PX +
    sheetPx +
    FAB_EXPANDED_DUAL_SEGMENT_GAP_PX +
    notePx +
    FAB_EXPANDED_DUAL_SEGMENT_GAP_PX +
    aiPx
  );
}

function FabTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="px-2 py-1.5 text-[11px] leading-tight"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function StoreSheetTab({
  tab,
  isActive,
  isReceive,
  canClose,
  onSelect,
  onClose,
  onRename,
  onReceive,
}: {
  tab: ScratchNoteTab;
  isActive: boolean;
  isReceive: boolean;
  canClose: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string) => void;
  onReceive: () => void;
}) {
  return (
    <ChromeTab
      name={tab.name}
      isActive={isActive}
      canClose={canClose}
      onSelect={onSelect}
      onClose={onClose}
      onRename={onRename}
      leading={
        <span
          className="flex shrink-0 items-center pl-0.5"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={isReceive}
            aria-label={`Add Analysis lines to ${tab.name}`}
            title="Receive + adds"
            className="size-3 rounded-[3px] border-[var(--border)] after:inset-0 data-checked:border-[var(--foreground)] data-checked:bg-[var(--foreground)] data-checked:text-[var(--background)]"
            onCheckedChange={(checked) => {
              if (checked) onReceive();
            }}
          />
        </span>
      }
    />
  );
}

function StoreSheetPanel({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
}) {
  const { tabs, activeId, receiveId } = useScratchNote();
  const actions = useScratchNoteActions();
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const rows = activeTab?.rows ?? [];
  const currency = rows[0]?.currency ?? "CAD";
  const totalSpend = useMemo(
    () => rows.reduce((sum, row) => sum + row.spend, 0),
    [rows],
  );
  const totalCount = useMemo(
    () => rows.reduce((sum, row) => sum + row.count, 0),
    [rows],
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <FabTooltip label="Open store sheet">
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </FabTooltip>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="pointer-events-auto w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden border border-[var(--border)] bg-[var(--background)] p-0 shadow-lg duration-0 data-closed:animate-none data-open:animate-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Stay open while clicking Analysis + / page; close via Sheet FAB or Escape.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="relative border-b border-[var(--border)] bg-[var(--muted)]/25">
          <div
            role="tablist"
            aria-label="Store sheet tabs"
            className="flex min-w-0 flex-nowrap items-end gap-0.5 overflow-x-auto px-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab) => (
              <StoreSheetTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeId}
                isReceive={tab.id === receiveId}
                canClose={tabs.length > 1}
                onSelect={() => actions.selectTab(tab.id)}
                onClose={() => actions.closeTab(tab.id)}
                onRename={(name) => actions.renameTab(tab.id, name)}
                onReceive={() => actions.setReceiveTab(tab.id)}
              />
            ))}
            <button
              type="button"
              aria-label="Add store sheet tab"
              title="Add tab"
              className="mb-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-accent hover:bg-accent-subtle hover:text-accent"
              onClick={() => actions.addTab()}
            >
              <PlusIcon className="size-3" strokeWidth={2} />
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
            Check a tab, then use + on a vendor line in Analysis.
          </p>
        ) : (
          <div className="max-h-[min(320px,50vh)] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[var(--background)]">
                <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <th className="px-2 py-1.5 text-left font-medium">Name</th>
                  <th className="px-2 py-1.5 text-right font-medium">Spend</th>
                  <th className="px-2 py-1.5 text-right font-medium">Count</th>
                  <th className="w-7 px-1 py-1.5">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="max-w-[10rem] px-2 py-1.5">
                      <div className="truncate font-medium text-[var(--foreground)]">
                        {row.name}
                      </div>
                      {row.parent ? (
                        <div className="truncate text-[10px] text-[var(--muted-foreground)]">
                          {row.parent}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <MoneyText amount={row.spend} currency={row.currency} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                      {row.count}
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        aria-label={`Remove ${row.name}`}
                        className="inline-flex size-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        onClick={() => actions.removeRow(row.id)}
                      >
                        <XIcon className="size-3" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border)] bg-[var(--muted)]/40 text-sm font-medium">
                  <td className="px-2 py-2">Total</td>
                  <td className="px-2 py-2 text-right">
                    <MoneyText amount={totalSpend} currency={currency} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {totalCount}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-0.5 border-t border-[var(--border)] px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-[var(--muted-foreground)]"
            disabled={rows.length === 0}
            onClick={() => actions.clearActive()}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-[var(--muted-foreground)]"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                storeSheetCsvFilename(activeTab?.name ?? "store-sheet"),
                toCsv(
                  ["Name", "Parent", "Spend", "Count", "Currency"],
                  rows.map((row) => [
                    row.name,
                    row.parent ?? "",
                    row.spend,
                    row.count,
                    row.currency,
                  ]),
                ),
              )
            }
          >
            Export CSV
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotesPanel({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
}) {
  const notes = useUserNotes();
  const actions = useUserNotesActions();
  useEnsureDefaultUserNote(open, notes);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null;

  useEffect(() => {
    if (notes.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !notes.some((n) => n.id === activeId)) {
      setActiveId(notes[0]!.id);
    }
  }, [activeId, notes]);

  useEffect(() => {
    setDraft(active?.content ?? "");
  }, [active?.id, active?.content]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = (note: UserNoteRecord, content: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void actions.updateContent(note.id, content);
    }, 500);
  };

  const selectTab = async (noteId: UserNoteRecord["id"]) => {
    if (active && draft !== active.content) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await actions.updateContent(active.id, draft);
    }
    setActiveId(noteId);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <FabTooltip label="Open notes">
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </FabTooltip>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="pointer-events-auto w-[min(23rem,calc(100vw-1rem))] gap-0 overflow-hidden border border-[var(--border)] bg-[var(--background)] p-0 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="relative border-b border-[var(--border)] bg-[var(--muted)]/25">
          <div
            role="tablist"
            aria-label="Note tabs"
            className="flex min-w-0 flex-nowrap items-end gap-0.5 overflow-x-auto px-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {notes.map((note) => (
              <ChromeTab
                key={note.id}
                name={note.tabName}
                isActive={note.id === active?.id}
                canClose={notes.length > 1}
                onSelect={() => void selectTab(note.id)}
                onClose={() => actions.removeTab(note.id)}
                onRename={(name) => actions.renameTab(note.id, name)}
              />
            ))}
            <button
              type="button"
              aria-label="Add note tab"
              title="Add tab"
              className="mb-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-accent hover:bg-accent-subtle hover:text-accent"
              onClick={() => {
                void actions.insertTab().then((created) => {
                  setActiveId(created.id);
                  setDraft(created.content);
                });
              }}
            >
              <PlusIcon className="size-3" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="h-[min(320px,50vh)] w-full bg-[var(--background)]">
          {active ? (
            <Textarea
              value={draft}
              onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
                scheduleSave(active, next);
              }}
              onBlur={() => {
                if (draft !== active.content) {
                  if (saveTimer.current) clearTimeout(saveTimer.current);
                  void actions.updateContent(active.id, draft);
                }
              }}
              placeholder="Type or paste a note…"
              aria-label={`${active.tabName} note`}
              className="h-full min-h-[min(300px,48vh)] w-full resize-none rounded-none border-0 bg-transparent px-2.5 py-2 text-[11px] shadow-none focus-visible:ring-0"
            />
          ) : (
            <p className="px-2.5 py-3 text-[11px] text-[var(--muted-foreground)]">
              Loading…
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Bottom-right utilitek-style dual FAB: Store sheet + Notes. */
export function PersistentNoteFab() {
  const [hovered, setHovered] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [piggyMood, setPiggyMood] = useState<PiggyMood>("still");
  const { tabs, activeId } = useScratchNote();
  const notes = useUserNotes();
  useScratchNoteLocalMigration();

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const sheetRowCount = activeTab?.rows.length ?? 0;
  const totalSheetRows = useMemo(
    () => tabs.reduce((sum, tab) => sum + tab.rows.length, 0),
    [tabs],
  );
  const noteCount = notes.length;
  const isExpanded = hovered || sheetOpen || notesOpen || aiOpen;
  const badgeLabel = formatBadge(totalSheetRows);
  const showBadge = totalSheetRows > 0;

  const pillWidth = isExpanded
    ? expandedPillWidthPx(
        sheetRowCount,
        noteCount,
        sheetOpen,
        notesOpen,
        aiOpen,
      )
    : FAB_COLLAPSED_PX;

  useEffect(
    () =>
      subscribeScratchNoteOpen(() => {
        setNotesOpen(false);
        setAiOpen(false);
        setSheetOpen(true);
      }),
    [],
  );

  const handleSheetOpenChange = (next: boolean) => {
    setSheetOpen(next);
    if (next) {
      setNotesOpen(false);
      setAiOpen(false);
    }
  };

  const handleNotesOpenChange = (next: boolean) => {
    setNotesOpen(next);
    if (next) {
      setSheetOpen(false);
      setAiOpen(false);
    }
  };

  const handleAiOpenChange = (next: boolean) => {
    setAiOpen(next);
    if (next) {
      setSheetOpen(false);
      setNotesOpen(false);
    }
  };

  const segmentBtn = (active: boolean) =>
    cn(
      "relative flex shrink-0 cursor-pointer items-center rounded-full outline-none",
      active ? "flex-row gap-0.5" : "size-7 justify-center",
      "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
    );

  return (
    <div className="pointer-events-none fixed right-2 bottom-2 z-40 flex flex-col items-end">
      <TooltipProvider>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ width: pillWidth, height: FAB_COLLAPSED_PX }}
          className={cn(
            "pointer-events-auto flex shrink-0 flex-row items-center overflow-hidden rounded-full border border-[var(--border)]/80",
            "bg-[var(--background)] text-[var(--foreground)] shadow-md ring-1 ring-[var(--border)]/40",
            "transition-[width,box-shadow] duration-300 ease-out hover:shadow-lg",
            isExpanded ? "justify-start gap-0 px-1" : "justify-center px-0",
          )}
        >
          {!isExpanded ? (
            <FabTooltip label="Open store sheet, notes, and AI">
              <button
                type="button"
                aria-label={
                  showBadge
                    ? `Workspace, ${totalSheetRows} store sheet lines`
                    : "Open store sheet, notes, and AI"
                }
                onClick={() => {
                  setNotesOpen(false);
                  setAiOpen(false);
                  setSheetOpen(true);
                }}
                className="flex h-full w-full cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1"
              >
                <ChevronLeft
                  className="size-3 shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
                {showBadge ? (
                  <span
                    className={cn(
                      CORNER_BADGE_CLASS,
                      badgeLabel.length > 1
                        ? "min-w-4 px-0.5"
                        : "aspect-square px-0",
                    )}
                    aria-hidden
                  >
                    {badgeLabel}
                  </span>
                ) : null}
              </button>
            </FabTooltip>
          ) : (
            <>
              <StoreSheetPanel
                open={sheetOpen}
                onOpenChange={handleSheetOpenChange}
                trigger={
                  <button
                    type="button"
                    aria-expanded={sheetOpen}
                    aria-haspopup="dialog"
                    aria-label={
                      sheetRowCount > 0
                        ? `Store sheet, ${sheetRowCount} lines`
                        : "Store sheet"
                    }
                    className={segmentBtn(sheetOpen)}
                  >
                    <FileSpreadsheet
                      className="size-3 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                    />
                    {sheetOpen ? (
                      <span className="flex min-w-0 select-none items-center gap-1 pr-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap">
                        <span>Sheet</span>
                        <span
                          className="tabular-nums text-[var(--muted-foreground)]"
                          aria-hidden
                        >
                          {sheetRowCount}
                        </span>
                      </span>
                    ) : null}
                    {showBadge && !sheetOpen ? (
                      <span
                        className={cn(
                          CORNER_BADGE_CLASS,
                          badgeLabel.length > 1
                            ? "min-w-4 px-0.5"
                            : "aspect-square px-0",
                        )}
                        aria-hidden
                      >
                        {badgeLabel}
                      </span>
                    ) : null}
                  </button>
                }
              />

              <NotesPanel
                open={notesOpen}
                onOpenChange={handleNotesOpenChange}
                trigger={
                  <button
                    type="button"
                    aria-expanded={notesOpen}
                    aria-haspopup="dialog"
                    aria-label={
                      noteCount > 0 ? `Notes, ${noteCount} tabs` : "Notes"
                    }
                    className={segmentBtn(notesOpen)}
                  >
                    <StickyNote
                      className="size-3 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                    />
                    {notesOpen ? (
                      <span className="flex min-w-0 select-none items-center gap-1 pr-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap">
                        <span>Note</span>
                        <span
                          className="tabular-nums text-[var(--muted-foreground)]"
                          aria-hidden
                        >
                          {noteCount}
                        </span>
                      </span>
                    ) : null}
                  </button>
                }
              />

              <LedgerAiChat
                open={aiOpen}
                onOpenChange={handleAiOpenChange}
                onMoodChange={setPiggyMood}
                trigger={
                  <button
                    type="button"
                    aria-expanded={aiOpen}
                    aria-haspopup="dialog"
                    aria-label="Piggy"
                    className={segmentBtn(aiOpen)}
                  >
                    <PiggyMascot
                      mood={aiOpen ? piggyMood : "still"}
                      iconClassName="size-3 shrink-0"
                    />
                    {aiOpen ? (
                      <span className="flex min-w-0 select-none items-center pr-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap">
                        Piggy
                      </span>
                    ) : null}
                  </button>
                }
              />
            </>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
