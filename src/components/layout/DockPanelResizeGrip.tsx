"use client";

import { cn } from "@/lib/utils";
import type { useDockPanelSize } from "./useDockPanelSize";

const EDGE = "absolute z-30 hidden touch-none md:block";

/**
 * Invisible resize hit zones for a docked panel. Only the cursor reveals them.
 * Place inside a `relative` panel root.
 *
 * Bottom-right dock: top + left edges and top-left corner.
 * Top-right dock: bottom + left edges and bottom-left corner.
 */
export function DockPanelResizeGrip({
  label,
  resize,
}: {
  label: string;
  resize: ReturnType<typeof useDockPanelSize>;
}) {
  const fromTop = resize.anchor === "bottom-right";
  const hint = "Drag to resize · double-click to reset";

  return (
    <>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${label} height. Drag the ${fromTop ? "top" : "bottom"} edge, double-click to reset.`}
        title={hint}
        className={cn(
          EDGE,
          "inset-x-0 h-2 cursor-ns-resize",
          fromTop ? "top-0" : "bottom-0",
        )}
        {...resize.edgeProps("y")}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} width. Drag the left edge, double-click to reset.`}
        title={hint}
        className={cn(EDGE, "inset-y-0 left-0 w-2 cursor-ew-resize")}
        {...resize.edgeProps("x")}
      />
      <div
        role="separator"
        aria-label={`Resize ${label}. Drag the corner to resize, double-click to reset.`}
        title={hint}
        className={cn(
          EDGE,
          "left-0 z-40 size-4",
          fromTop ? "top-0 cursor-nwse-resize" : "bottom-0 cursor-nesw-resize",
        )}
        {...resize.gripProps}
      />
    </>
  );
}
