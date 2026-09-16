"use client";

import { cn } from "@/lib/utils";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { XIcon } from "lucide-react";

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
