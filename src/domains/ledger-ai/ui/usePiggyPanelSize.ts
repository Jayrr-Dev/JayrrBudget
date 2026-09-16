"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "piggy-chat-panel-size";
const REM = 16;
const MIN_WIDTH = 20 * REM;
const MAX_WIDTH = 56 * REM;
const MIN_TRANSCRIPT = 12 * REM;
/** Room for the tab strip, composer, fab pill, and screen margins. */
const CHROME_HEIGHT = 12 * REM;

export const DEFAULT_PIGGY_PANEL_SIZE: PiggyPanelSize = {
  width: 24 * REM,
  transcriptHeight: 21.3 * REM,
};

export type PiggyPanelSize = {
  width: number;
  transcriptHeight: number;
};

/** Which screen corner the panel hugs; the grip sits on the opposite corner. */
export type PiggyPanelAnchor = "bottom-right" | "top-right";

function clampSize(size: PiggyPanelSize): PiggyPanelSize {
  const maxWidth = Math.min(MAX_WIDTH, window.innerWidth - 1.5 * REM);
  const maxTranscript = Math.max(MIN_TRANSCRIPT, window.innerHeight - CHROME_HEIGHT);
  return {
    width: Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, size.width))),
    transcriptHeight: Math.round(
      Math.min(maxTranscript, Math.max(MIN_TRANSCRIPT, size.transcriptHeight)),
    ),
  };
}

function readStoredSize(): PiggyPanelSize | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PiggyPanelSize).width === "number" &&
      typeof (parsed as PiggyPanelSize).transcriptHeight === "number"
    ) {
      return clampSize(parsed as PiggyPanelSize);
    }
  } catch {
    // Ignore unreadable storage; fall back to the default size.
  }
  return undefined;
}

function writeStoredSize(size: PiggyPanelSize | undefined) {
  try {
    if (size) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or blocked; the size still applies for this session.
  }
}

/**
 * Drag-to-resize state for the docked Piggy panel, remembered per browser.
 * Width grows as the grip moves left; height grows away from the anchored edge.
 */
export function usePiggyPanelSize(anchor: PiggyPanelAnchor) {
  const [size, setSize] = useState<PiggyPanelSize>(DEFAULT_PIGGY_PANEL_SIZE);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ startX: number; startY: number; origin: PiggyPanelSize } | null>(null);

  useEffect(() => {
    const stored = readStoredSize();
    if (stored) setSize(stored);
  }, []);

  const onGripPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startY: event.clientY, origin: size };
      setResizing(true);
    },
    [size],
  );

  const onGripPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const heightDelta = anchor === "bottom-right" ? -dy : dy;
      setSize(
        clampSize({
          width: current.origin.width - dx,
          transcriptHeight: current.origin.transcriptHeight + heightDelta,
        }),
      );
    },
    [anchor],
  );

  const onGripPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setResizing(false);
      setSize((current) => {
        writeStoredSize(current);
        return current;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setSize(DEFAULT_PIGGY_PANEL_SIZE);
    writeStoredSize(undefined);
  }, []);

  return {
    size,
    resizing,
    reset,
    gripProps: {
      onPointerDown: onGripPointerDown,
      onPointerMove: onGripPointerMove,
      onPointerUp: onGripPointerUp,
      onPointerCancel: onGripPointerUp,
    },
  };
}
