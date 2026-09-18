"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const REM = 16;
const MIN_WIDTH = 20 * REM;
const MAX_WIDTH = 56 * REM;
const MIN_BODY = 8 * REM;
/** Room for headers, footers, the fab pill, and screen margins. */
const CHROME_HEIGHT = 12 * REM;

export const DOCK_PANEL_DEFAULT_WIDTH = 24 * REM;

export type DockPanelSize = {
  width: number;
  /** Pixel height of the panel's scrolling body (not the whole panel). */
  bodyHeight: number;
};

/** Which screen corner the panel hugs; the grip sits on the opposite corner. */
export type DockPanelAnchor = "bottom-right" | "top-right";

export type DockResizeAxis = "x" | "y" | "both";

function clampSize(size: DockPanelSize): DockPanelSize {
  const maxWidth = Math.min(MAX_WIDTH, window.innerWidth - 1.5 * REM);
  const maxBody = Math.max(MIN_BODY, window.innerHeight - CHROME_HEIGHT);
  return {
    width: Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, size.width))),
    bodyHeight: Math.round(
      Math.min(maxBody, Math.max(MIN_BODY, size.bodyHeight)),
    ),
  };
}

function readStoredSize(storageKey: string): DockPanelSize | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as DockPanelSize).width === "number" &&
      typeof (parsed as DockPanelSize).bodyHeight === "number"
    ) {
      return clampSize(parsed as DockPanelSize);
    }
  } catch {
    // Ignore unreadable storage; fall back to the default size.
  }
  return undefined;
}

function writeStoredSize(storageKey: string, size: DockPanelSize | undefined) {
  try {
    if (size) window.localStorage.setItem(storageKey, JSON.stringify(size));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Storage full or blocked; the size still applies for this session.
  }
}

type DragState = {
  startX: number;
  startY: number;
  origin: DockPanelSize;
  axis: DockResizeAxis;
};

/**
 * Drag-to-resize state for a fab-docked panel, remembered per browser.
 * Width grows as the left edge moves left; height grows away from the anchored edge.
 */
export function useDockPanelSize({
  storageKey,
  defaultSize,
  anchor,
}: {
  storageKey: string;
  defaultSize: DockPanelSize;
  anchor: DockPanelAnchor;
}) {
  const [size, setSize] = useState<DockPanelSize>(defaultSize);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const stored = readStoredSize(storageKey);
    if (stored) setSize(stored);
    const onResize = () => setSize((current) => clampSize(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [storageKey]);

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, axis: DockResizeAxis) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        startX: event.clientX,
        startY: event.clientY,
        origin: size,
        axis,
      };
      setResizing(true);
    },
    [size],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const heightDelta = anchor === "bottom-right" ? -dy : dy;
      setSize(
        clampSize({
          width:
            current.axis === "y"
              ? current.origin.width
              : current.origin.width - dx,
          bodyHeight:
            current.axis === "x"
              ? current.origin.bodyHeight
              : current.origin.bodyHeight + heightDelta,
        }),
      );
    },
    [anchor],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setResizing(false);
      setSize((current) => {
        writeStoredSize(storageKey, current);
        return current;
      });
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    setSize(defaultSize);
    writeStoredSize(storageKey, undefined);
  }, [defaultSize, storageKey]);

  const handleProps = useCallback(
    (axis: DockResizeAxis) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
        beginDrag(event, axis),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: reset,
    }),
    [beginDrag, onPointerMove, onPointerUp, reset],
  );

  return {
    size,
    resizing,
    anchor,
    gripProps: handleProps("both"),
    edgeProps: handleProps,
  };
}
