"use client";

import {
  useMinimizedDialogsRegistry,
  type MinimizedDialogEntry,
} from "@/components/ui/dialog-minimize-registry";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";
import { useState } from "react";

const FAB_COLLAPSED_PX = 32;
const FAB_EXPANDED_BASE_PX = 88;
const FAB_EXPANDED_EXTRA_PER_CHAR_PX = 5;
const FAB_EXPANDED_MAX_PX = 176;

function pillWidthPx(label: string) {
  const extra = Math.max(0, label.length - 4) * FAB_EXPANDED_EXTRA_PER_CHAR_PX;
  return Math.min(FAB_EXPANDED_MAX_PX, FAB_EXPANDED_BASE_PX + extra);
}

function MinimizedDialogCircle({ entry }: { entry: MinimizedDialogEntry }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isExpanded = hovered || focused;
  const width = pillWidthPx(entry.label);

  return (
    <div
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <button
        type="button"
        title={entry.label}
        aria-label={`Restore dialog: ${entry.label}`}
        onClick={entry.restore}
        style={{
          width: isExpanded ? width : FAB_COLLAPSED_PX,
          height: FAB_COLLAPSED_PX,
        }}
        className={cn(
          "pointer-events-auto flex shrink-0 flex-row items-center overflow-hidden rounded-full border border-border/80",
          "cursor-pointer bg-card text-foreground shadow-md ring-1 ring-border/40",
          "transition-[width,box-shadow] duration-300 ease-out",
          "hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isExpanded ? "justify-start gap-1 px-1.5" : "justify-center px-0",
        )}
      >
        <Maximize2 className="size-3 shrink-0" strokeWidth={2} aria-hidden />
        <span
          className={cn(
            "min-w-0 truncate text-[11px] font-medium tracking-tight whitespace-nowrap transition-opacity duration-200",
            isExpanded ? "max-w-32 opacity-100" : "max-w-0 opacity-0",
          )}
        >
          {entry.label}
        </span>
      </button>
    </div>
  );
}

export function MinimizedDialogStack() {
  const registry = useMinimizedDialogsRegistry();
  if (!registry || registry.entries.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-3 bottom-16 z-40 hidden flex-col-reverse items-end gap-2 md:flex">
      {registry.entries.map((entry) => (
        <MinimizedDialogCircle key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
