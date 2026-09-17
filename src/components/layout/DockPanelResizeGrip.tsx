"use client";

import { cn } from "@/lib/utils";
import type { useDockPanelSize } from "./useDockPanelSize";

/**
 * Invisible corner hit zone for a docked panel. Only the cursor reveals it.
 * Place inside a `relative` panel root.
 */
export function DockPanelResizeGrip({
  label,
  resize,
}: {
  label: string;
  resize: ReturnType<typeof useDockPanelSize>;
}) {
  return (
    <div
      role="separator"
      aria-label={`Resize ${label}. Drag to resize, double-click to reset.`}
      title="Drag to resize · double-click to reset"
      className={cn(
        "absolute left-0 z-30 hidden size-5 touch-none md:block",
        resize.anchor === "bottom-right"
          ? "top-0 cursor-nwse-resize"
          : "bottom-0 cursor-nesw-resize",
      )}
      {...resize.gripProps}
    />
  );
}
