"use client";

import { ChromeTab, ChromeTabStrip } from "@/components/layout/ChromeTab";
import { DockPanelResizeGrip } from "@/components/layout/DockPanelResizeGrip";
import {
  DOCK_PANEL_DEFAULT_WIDTH,
  useDockPanelSize,
  type DockPanelAnchor,
} from "@/components/layout/useDockPanelSize";
import {
  useVaultCacheDebugAdmin,
  VaultCacheDebugPanel,
} from "@/components/layout/VaultCacheDebugFab";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PiggyIcon } from "@/components/ui/piggy-icon";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { LedgerAiChat } from "@/domains/ledger-ai/ui/LedgerAiChat";
import { PiggyMarkdown } from "@/domains/ledger-ai/ui/PiggyMarkdown";
import {
  PiggyMascot,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { PiggySketchDialog } from "@/domains/ledger-ai/ui/PiggySketchDialog";
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
import { ChevronLeft, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

function storeSheetCsvFilename(tabName: string) {
  const slug = tabName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "store-sheet"}.csv`;
}

const FAB_COLLAPSED_PX = 44;
/** Panels stack in the same fixed column as the pill, so they hug the right edge like the debug panel. */
const FAB_DOCK_PANEL =
  "pointer-events-auto relative max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-lg ring-1 ring-border/40 max-md:w-[calc(100vw-1.5rem)]";
const FAB_DOCK_BODY_DEFAULT_PX = 320;
const FAB_EXPANDED_ICON_ONLY_SEGMENT_PX = 36;
const FAB_EXPANDED_PILL_INNER_PADDING_PX = 8;
const FAB_EXPANDED_DUAL_SEGMENT_GAP_PX = 2;
// Widths fit text-sm labels: icon (24) + label + optional count.
const FAB_EXPANDED_BASE_PX = 80;
const FAB_EXPANDED_PIGGY_PX = 88;
const FAB_EXPANDED_DEBUG_PX = 84;
const FAB_EXPANDED_EXTRA_PER_COUNT_DIGIT_PX = 8;
const FAB_EXPANDED_MAX_PX = 112;
const BADGE_CAP = 99;

const CORNER_BADGE_CLASS =
  "pointer-events-none absolute z-[1] flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--muted-foreground)] px-1 text-[11px] font-semibold leading-none text-[var(--background)] shadow-sm";

const FAB_PILL_BADGE_CLASS = cn(CORNER_BADGE_CLASS, "-top-1 -right-1");
const FAB_SEGMENT_BADGE_CLASS = cn(CORNER_BADGE_CLASS, "top-0 right-0");

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
  debugOpen: boolean,
  showDebug: boolean,
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
  const debugPx = showDebug
    ? debugOpen
      ? FAB_EXPANDED_DEBUG_PX
      : FAB_EXPANDED_ICON_ONLY_SEGMENT_PX
    : 0;
  return (
    FAB_EXPANDED_PILL_INNER_PADDING_PX +
    sheetPx +
    FAB_EXPANDED_DUAL_SEGMENT_GAP_PX +
    notePx +
    FAB_EXPANDED_DUAL_SEGMENT_GAP_PX +
    aiPx +
    (showDebug ? FAB_EXPANDED_DUAL_SEGMENT_GAP_PX + debugPx : 0)
  );
}

function FabTooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactElement;
  side?: "top" | "bottom";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
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
            className="size-3 rounded-[3px] border-[var(--border)] after:inset-0 max-md:size-4 data-checked:border-[var(--foreground)] data-checked:bg-[var(--foreground)] data-checked:text-[var(--background)]"
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
  anchor,
}: {
  open: boolean;
  anchor: DockPanelAnchor;
}) {
  const { tabs, activeId, receiveId } = useScratchNote();
  const actions = useScratchNoteActions();
  const resize = useDockPanelSize({
    storageKey: "store-sheet-panel-size",
    defaultSize: {
      width: DOCK_PANEL_DEFAULT_WIDTH,
      bodyHeight: FAB_DOCK_BODY_DEFAULT_PX,
    },
    anchor,
  });
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

  if (!open) return null;

  return (
    <div
      className={cn(FAB_DOCK_PANEL, resize.resizing && "select-none")}
      style={{ width: resize.size.width }}
    >
      <DockPanelResizeGrip label="store sheet" resize={resize} />
      <div className="relative border-b border-[var(--border)] bg-[var(--muted)]/25">
        <ChromeTabStrip
          ariaLabel="Store sheet tabs"
          trailing={
            <button
              type="button"
              aria-label="Add store sheet tab"
              title="Add tab"
              className="inline-flex size-5 shrink-0 touch-manipulation items-center justify-center rounded-sm text-accent max-md:size-8 hover:bg-accent-subtle hover:text-accent"
              onClick={() => actions.addTab()}
            >
              <PlusIcon className="size-3" strokeWidth={2} />
            </button>
          }
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
        </ChromeTabStrip>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
          Check a tab, then use + on a vendor line in Analysis.
        </p>
      ) : (
        <div
          className="overflow-auto"
          style={{ maxHeight: resize.size.bodyHeight }}
        >
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
    </div>
  );
}

function NotesPanel({
  open,
  anchor,
}: {
  open: boolean;
  anchor: DockPanelAnchor;
}) {
  const notes = useUserNotes();
  const actions = useUserNotesActions();
  const resize = useDockPanelSize({
    storageKey: "notes-panel-size",
    defaultSize: {
      width: DOCK_PANEL_DEFAULT_WIDTH,
      bodyHeight: FAB_DOCK_BODY_DEFAULT_PX,
    },
    anchor,
  });
  useEnsureDefaultUserNote(open, notes);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
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
    if (!active) {
      setEditing(false);
      return;
    }
    setEditing(!active.content.trim());
  }, [active?.id]);

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

  if (!open) return null;

  return (
    <div
      className={cn(FAB_DOCK_PANEL, resize.resizing && "select-none")}
      style={{ width: resize.size.width }}
    >
      <DockPanelResizeGrip label="notes" resize={resize} />
      <div className="relative border-b border-[var(--border)] bg-[var(--muted)]/25">
        <ChromeTabStrip
          ariaLabel="Note tabs"
          trailing={
            <button
              type="button"
              aria-label="Add note tab"
              title="Add tab"
              className="inline-flex size-5 shrink-0 touch-manipulation items-center justify-center rounded-sm text-accent max-md:size-8 hover:bg-accent-subtle hover:text-accent"
              onClick={() => {
                void actions.insertTab().then((created) => {
                  setActiveId(created.id);
                  setDraft(created.content);
                  setEditing(true);
                });
              }}
            >
              <PlusIcon className="size-3" strokeWidth={2} />
            </button>
          }
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
        </ChromeTabStrip>
      </div>

      <div
        className="flex w-full flex-col bg-[var(--background)]"
        style={{ height: resize.size.bodyHeight }}
      >
        {active ? (
          editing ? (
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
              placeholder="Type or paste markdown…"
              aria-label={`${active.tabName} note source`}
              className="h-full min-h-0 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-2.5 py-2 text-[11px] shadow-none focus-visible:ring-0"
            />
          ) : (
            <div
              role="article"
              aria-label={`${active.tabName} note. Double-click to edit.`}
              className="h-full min-h-0 w-full flex-1 overflow-auto px-2.5 py-2"
              onDoubleClick={() => setEditing(true)}
            >
              {draft.trim() ? (
                <PiggyMarkdown
                  text={draft}
                  className="text-[11px] [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs"
                />
              ) : (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Empty note. Switch to Edit to type, or ask Piggy to save a
                  table here.
                </p>
              )}
            </div>
          )
        ) : (
          <p className="px-2.5 py-3 text-[11px] text-[var(--muted-foreground)]">
            Loading…
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-0.5 border-t border-[var(--border)] px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn(
            "text-[var(--muted-foreground)]",
            !editing && "text-[var(--foreground)]",
          )}
          disabled={!active}
          onClick={() => {
            if (active && draft !== active.content) {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              void actions.updateContent(active.id, draft);
            }
            setEditing(false);
          }}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn(
            "text-[var(--muted-foreground)]",
            editing && "text-[var(--foreground)]",
          )}
          disabled={!active}
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3" strokeWidth={2} />
          <span>Edit</span>
        </Button>
      </div>
    </div>
  );
}

/** Store sheet, notes, Piggy, and optional debug. Floating pill on desktop; header icons on mobile. */
export function PersistentNoteFab({
  placement = "floating",
}: {
  placement?: "floating" | "navbar";
}) {
  const [hovered, setHovered] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [piggyMood, setPiggyMood] = useState<PiggyMood>("still");
  const showDebug = useVaultCacheDebugAdmin();
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
  const isExpanded = hovered || sheetOpen || notesOpen || aiOpen || debugOpen;
  const badgeLabel = formatBadge(totalSheetRows);
  const showBadge = totalSheetRows > 0;

  const pillWidth = isExpanded
    ? expandedPillWidthPx(
        sheetRowCount,
        noteCount,
        sheetOpen,
        notesOpen,
        aiOpen,
        debugOpen,
        showDebug,
      )
    : FAB_COLLAPSED_PX;

  useEffect(
    () =>
      subscribeScratchNoteOpen(() => {
        setNotesOpen(false);
        setAiOpen(false);
        setDebugOpen(false);
        setSheetOpen(true);
      }),
    [],
  );

  const handleSheetOpenChange = (next: boolean) => {
    setSheetOpen(next);
    if (next) {
      setNotesOpen(false);
      setAiOpen(false);
      setDebugOpen(false);
    }
  };

  const handleNotesOpenChange = (next: boolean) => {
    setNotesOpen(next);
    if (next) {
      setSheetOpen(false);
      setAiOpen(false);
      setDebugOpen(false);
    }
  };

  const handleAiOpenChange = (next: boolean) => {
    setAiOpen(next);
    if (next) {
      setSheetOpen(false);
      setNotesOpen(false);
      setDebugOpen(false);
    }
  };

  const handleDebugOpenChange = (next: boolean) => {
    setDebugOpen(next);
    if (next) {
      setSheetOpen(false);
      setNotesOpen(false);
      setAiOpen(false);
    }
  };

  const isNavbar = placement === "navbar";
  const contentSide = isNavbar ? "bottom" : "top";
  const segmentBtn = (active: boolean) =>
    isNavbar
      ? cn(
          "relative flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-lg outline-none",
          "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]",
          active && "bg-[var(--sidebar-accent)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )
      : cn(
          "relative flex shrink-0 cursor-pointer items-center rounded-full outline-none",
          active ? "flex-row gap-0.5" : "size-9 justify-center",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
        );

  const actions = (
    <>
      <FabTooltip label="Open store sheet" side={contentSide}>
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
          onClick={() => handleSheetOpenChange(!sheetOpen)}
        >
          <PiggyIcon name="sheet" className="size-6" />
          {sheetOpen && !isNavbar ? (
            <span className="flex min-w-0 select-none items-center gap-1 pr-0.5 text-sm font-medium tracking-tight whitespace-nowrap">
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
                isNavbar
                  ? cn(CORNER_BADGE_CLASS, "-top-0.5 -right-0.5")
                  : FAB_SEGMENT_BADGE_CLASS,
                badgeLabel.length > 1 ? "min-w-6 px-1" : "aspect-square px-0",
              )}
              aria-hidden
            >
              {badgeLabel}
            </span>
          ) : null}
        </button>
      </FabTooltip>

      <FabTooltip label="Open notes" side={contentSide}>
        <button
          type="button"
          aria-expanded={notesOpen}
          aria-haspopup="dialog"
          aria-label={noteCount > 0 ? `Notes, ${noteCount} tabs` : "Notes"}
          className={segmentBtn(notesOpen)}
          onClick={() => handleNotesOpenChange(!notesOpen)}
        >
          <PiggyIcon name="notes" className="size-6" />
          {notesOpen && !isNavbar ? (
            <span className="flex min-w-0 select-none items-center gap-1 pr-0.5 text-sm font-medium tracking-tight whitespace-nowrap">
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
      </FabTooltip>

      <PiggySketchDialog />

      <FabTooltip label="Piggy" side={contentSide}>
        <button
          type="button"
          aria-expanded={aiOpen}
          aria-haspopup="dialog"
          aria-label="Piggy"
          className={segmentBtn(aiOpen)}
          onClick={() => handleAiOpenChange(!aiOpen)}
        >
          <PiggyMascot
            mood={aiOpen ? piggyMood : "still"}
            iconClassName="size-8 shrink-0"
          />
          {aiOpen && !isNavbar ? (
            <span className="flex min-w-0 select-none items-center pr-0.5 text-sm font-medium tracking-tight whitespace-nowrap">
              Piggy
            </span>
          ) : null}
        </button>
      </FabTooltip>

      {showDebug ? (
        <FabTooltip label="Vault cache debug" side={contentSide}>
          <button
            type="button"
            aria-expanded={debugOpen}
            aria-pressed={debugOpen}
            aria-label="Vault cache debug"
            onClick={() => handleDebugOpenChange(!debugOpen)}
            className={segmentBtn(debugOpen)}
          >
            <PiggyIcon name="issues" className="size-6" />
            {debugOpen && !isNavbar ? (
              <span className="flex min-w-0 select-none items-center pr-0.5 text-sm font-medium tracking-tight whitespace-nowrap">
                Debug
              </span>
            ) : null}
          </button>
        </FabTooltip>
      ) : null}
    </>
  );

  const anchor: DockPanelAnchor = isNavbar ? "top-right" : "bottom-right";

  const debugPanel = showDebug ? (
    <VaultCacheDebugPanel
      open={debugOpen}
      anchor={anchor}
      onOpenChange={handleDebugOpenChange}
    />
  ) : null;

  const dockedPanels = (
    <>
      {debugPanel}
      <StoreSheetPanel open={sheetOpen} anchor={anchor} />
      <NotesPanel open={notesOpen} anchor={anchor} />
      <LedgerAiChat
        open={aiOpen}
        anchor={anchor}
        onOpenChange={handleAiOpenChange}
        onMoodChange={setPiggyMood}
      />
    </>
  );

  if (isNavbar) {
    return (
      <TooltipProvider>
        <div className="pointer-events-none fixed top-14 right-3 z-40 flex max-h-[min(70dvh,calc(100dvh-4.5rem))] flex-col items-end gap-2">
          <div className="pointer-events-auto flex max-h-full flex-col items-end gap-2 overflow-y-auto">
            {dockedPanels}
          </div>
        </div>
        <div className="flex h-11 items-center gap-0.5">{actions}</div>
      </TooltipProvider>
    );
  }

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-40 hidden flex-col items-end gap-2 md:flex">
      {dockedPanels}
      <TooltipProvider>
        <div
          className="relative transition-[width] duration-300 ease-out"
          style={{ width: pillWidth, height: FAB_COLLAPSED_PX }}
        >
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={cn(
              "pointer-events-auto flex h-full w-full shrink-0 flex-row items-center overflow-hidden rounded-full border border-[var(--border)]/80",
              "bg-[var(--background)] text-[var(--foreground)] shadow-md ring-1 ring-[var(--border)]/40",
              "transition-[box-shadow] duration-300 ease-out hover:shadow-lg",
              isExpanded ? "justify-start gap-0 px-1" : "justify-center px-0",
            )}
          >
            {isExpanded ? (
              actions
            ) : (
              <FabTooltip
                label={
                  showDebug
                    ? "Open workspace · Alt-click for cache debug"
                    : "Open store sheet, notes, and AI"
                }
              >
                <button
                  type="button"
                  aria-label={
                    showBadge
                      ? `Workspace, ${totalSheetRows} store sheet lines`
                      : "Open store sheet, notes, and AI"
                  }
                  onClick={(event) => {
                    if (showDebug && event.altKey) {
                      handleDebugOpenChange(!debugOpen);
                      return;
                    }
                    setNotesOpen(false);
                    setAiOpen(false);
                    setDebugOpen(false);
                    setSheetOpen(true);
                  }}
                  className="relative flex h-full w-full cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1"
                >
                  <ChevronLeft
                    className="size-4 shrink-0"
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </FabTooltip>
            )}
          </div>
          {!isExpanded && showBadge ? (
            <span
              className={cn(
                FAB_PILL_BADGE_CLASS,
                badgeLabel.length > 1 ? "min-w-6 px-1" : "aspect-square px-0",
              )}
              aria-hidden
            >
              {badgeLabel}
            </span>
          ) : null}
        </div>
      </TooltipProvider>
    </div>
  );
}
