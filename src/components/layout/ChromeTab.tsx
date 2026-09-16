"use client";

import { Arrows } from "@/components/ui/arrows";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { XIcon } from "lucide-react";

const TAB_SCROLL_RATIO = 0.7;

export function ChromeTabStrip({
  ariaLabel,
  trailing,
  children,
}: {
  ariaLabel: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    setOverflow(over);
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncOverflow();
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncOverflow, children]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest" });
    syncOverflow();
  }, [children, syncOverflow]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * TAB_SCROLL_RATIO,
      behavior: "smooth",
    });
  };

  return (
    <div className="flex min-w-0 items-end gap-0.5 px-0.5 pt-0.5">
      {overflow ? (
        <Arrows
          variant="ghost"
          shape="tower"
          size="sm"
          direction="left"
          aria-label="Scroll tabs left"
          className="mb-0.5 h-7"
          disabled={!canLeft}
          onClick={() => scrollByPage(-1)}
        />
      ) : null}
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={ariaLabel}
        onScroll={syncOverflow}
        className="flex min-w-0 flex-1 flex-nowrap items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {trailing ? (
        <div className="mb-0.5 flex shrink-0 items-center gap-0.5">{trailing}</div>
      ) : null}
      {overflow ? (
        <Arrows
          variant="ghost"
          shape="tower"
          size="sm"
          direction="right"
          aria-label="Scroll tabs right"
          className="mb-0.5 h-7"
          disabled={!canRight}
          onClick={() => scrollByPage(1)}
        />
      ) : null}
    </div>
  );
}

export function ChromeTab({
  name,
  isActive,
  canClose,
  leading,
  onSelect,
  onClose,
  onRename,
}: {
  name: string;
  isActive: boolean;
  canClose: boolean;
  leading?: ReactElement;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== name) onRename(next);
    else setDraft(name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(name);
      setEditing(false);
    }
  };

  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={editing ? -1 : 0}
      title="Double-click name to rename"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (editing) return;
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex h-7 min-w-[5.5rem] max-w-[8.5rem] shrink-0 cursor-pointer select-none items-center gap-0.5 rounded-t-md border border-b-0 px-0.5 transition-colors",
        isActive
          ? "z-[1] -mb-px border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm"
          : "border-transparent bg-[var(--muted)]/35 text-[var(--muted-foreground)] hover:bg-[var(--muted)]/55 hover:text-[var(--foreground)]",
      )}
    >
      {leading}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label="Tab name"
          className="min-w-0 flex-1 bg-transparent px-0.5 text-[11px] leading-snug outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate px-0.5 text-[11px] leading-snug"
          onDoubleClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          {name}
        </span>
      )}

      {canClose && isActive ? (
        <button
          type="button"
          aria-label={`Close ${name}`}
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
