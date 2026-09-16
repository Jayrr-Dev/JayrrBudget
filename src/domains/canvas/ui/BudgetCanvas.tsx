"use client";

import { CanvasAiChat } from "@/domains/canvas/ui/CanvasAiChat";
import { CanvasApiContext } from "@/domains/canvas/ui/canvasApiContext";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useCallback, useRef, useState, type ComponentProps } from "react";

const STORAGE_KEY = "jayrr-budget-excalidraw";

function loadStoredScene(): ExcalidrawInitialDataState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const record = data as ExcalidrawInitialDataState;
    if (record.elements != null && !Array.isArray(record.elements)) return null;
    return {
      elements: record.elements ?? [],
      appState: record.appState ?? undefined,
      files: record.files,
      scrollToContent: true,
    };
  } catch {
    return null;
  }
}

export function BudgetCanvas() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData] = useState(loadStoredScene);
  const saveTimer = useRef(0);

  const onChange = useCallback<
    NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>
  >((elements, appState, files) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          serializeAsJSON(elements, appState, files, "local"),
        );
      } catch {
        return;
      }
    }, 250);
  }, []);

  return (
    <CanvasApiContext.Provider value={api}>
      <div className="h-full min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={initialData ?? undefined}
          onChange={onChange}
          theme="light"
          UIOptions={{ canvasActions: { toggleTheme: false } }}
          renderTopRightUI={() => <CanvasAiChat />}
        />
      </div>
    </CanvasApiContext.Provider>
  );
}
