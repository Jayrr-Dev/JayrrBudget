"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatMoney } from "@/domains/dashboard/domain/money";
import {
  addScratchNoteTab,
  clearScratchNote,
  closeScratchNoteTab,
  removeScratchNoteRow,
  renameScratchNoteTab,
  selectScratchNoteTab,
  setScratchNoteReceiveTab,
  subscribeScratchNoteOpen,
  useScratchNote,
  type ScratchNoteTab,
} from "@/domains/scratch-note/scratchNoteStore";
import { cn } from "@/lib/utils";
import { PlusIcon, StickyNote, XIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

const FAB_SIZE_PX = 32;

function NoteTab({
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(tab.name);
  }, [tab.name, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== tab.name) onRename(next);
    else setDraft(tab.name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(tab.name);
      setEditing(false);
    }
  };

  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      title="Double-click name to rename"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (editing) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex h-6 min-w-[5.5rem] max-w-[8.5rem] shrink-0 cursor-pointer select-none items-center gap-0.5 rounded-t-md border border-b-0 px-0.5 transition-colors",
        isActive
          ? "z-[1] -mb-px border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm"
          : "border-transparent bg-[var(--muted)]/35 text-[var(--muted-foreground)] hover:bg-[var(--muted)]/55 hover:text-[var(--foreground)]",
      )}
    >
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

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label="Tab name"
          className="min-w-0 flex-1 bg-transparent px-0.5 text-[11px] leading-none outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate px-0.5 text-[11px] leading-none"
          onDoubleClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          {tab.name}
        </span>
      )}

      {canClose && isActive ? (
        <button
          type="button"
          aria-label={`Close ${tab.name}`}
          className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <XIcon className="size-2.5" strokeWidth={2} />
        </button>
      ) : (
        <span className="inline-flex size-3.5 shrink-0" aria-hidden />
      )}
    </div>
  );
}

/** Bottom-right note FAB with Utilitek-style tabs + receive checkbox. */
export function PersistentNoteFab() {
  const [open, setOpen] = useState(false);
  const { tabs, activeId, receiveId } = useScratchNote();
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const rows = activeTab?.rows ?? [];

  useEffect(() => subscribeScratchNoteOpen(() => setOpen(true)), []);

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
    <div className="pointer-events-none fixed right-2 bottom-2 z-40 flex flex-col items-end">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Notes"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={
              rows.length > 0 ? `Notes, ${rows.length} lines` : "Notes"
            }
            style={{ width: FAB_SIZE_PX, height: FAB_SIZE_PX }}
            className={cn(
              "pointer-events-auto relative flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border)]",
              "bg-[var(--background)] text-[var(--foreground)] shadow-md",
              "transition-[box-shadow,background-color,color] duration-200 ease-out",
              "hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
              open && "bg-[var(--foreground)] text-[var(--background)]",
            )}
          >
            <StickyNote
              className="size-3 shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            {rows.length > 0 ? (
              <span
                className={cn(
                  "pointer-events-none absolute -top-0.5 -right-0.5 flex min-h-3 min-w-3 items-center justify-center rounded-full px-0.5",
                  "bg-[var(--foreground)] text-[9px] font-semibold leading-none text-[var(--background)] tabular-nums",
                  open && "bg-[var(--background)] text-[var(--foreground)]",
                )}
              >
                {rows.length > 99 ? "99+" : rows.length}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="top"
          sideOffset={6}
          className="pointer-events-auto w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden border border-[var(--border)] bg-[var(--background)] p-0 shadow-lg"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="relative border-b border-[var(--border)] bg-[var(--muted)]/25">
            <div
              role="tablist"
              aria-label="Note tabs"
              className="flex min-w-0 flex-nowrap items-end gap-0.5 overflow-x-auto px-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((tab) => (
                <NoteTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeId}
                  isReceive={tab.id === receiveId}
                  canClose={tabs.length > 1}
                  onSelect={() => selectScratchNoteTab(tab.id)}
                  onClose={() => closeScratchNoteTab(tab.id)}
                  onRename={(name) => renameScratchNoteTab(tab.id, name)}
                  onReceive={() => setScratchNoteReceiveTab(tab.id)}
                />
              ))}
              <button
                type="button"
                aria-label="Add tab"
                title="Add tab"
                className="mb-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]/70 hover:text-[var(--foreground)]"
                onClick={() => addScratchNoteTab()}
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
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatMoney(row.spend, row.currency)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                        {row.count}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          aria-label={`Remove ${row.name}`}
                          className="inline-flex size-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                          onClick={() => removeScratchNoteRow(row.id)}
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
                    <td className="px-2 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatMoney(totalSpend, currency)}
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

          <div className="flex items-center justify-end border-t border-[var(--border)] px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-[var(--muted-foreground)]"
              disabled={rows.length === 0}
              onClick={() => clearScratchNote()}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
