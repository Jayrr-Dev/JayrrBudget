"use client";

import { CanvasAiChat } from "@/domains/canvas/ui/CanvasAiChat";
import { CanvasApiContext } from "@/domains/canvas/ui/canvasApiContext";
import { api } from "@convex/_generated/api";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useMutation, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";

const STORAGE_KEY = "jayrr-budget-excalidraw";
const MIGRATED_KEY = "jayrr-budget-excalidraw-migrated";
const SAVE_DEBOUNCE_MS = 400;

function parseSceneJson(raw: string): ExcalidrawInitialDataState | null {
  try {
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

function loadStoredSceneRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalScene(sceneJson: string) {
  try {
    localStorage.setItem(STORAGE_KEY, sceneJson);
  } catch {
    // Quota or private mode — Convex remains the source of truth.
  }
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // ignore
  }
}

function isMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

export function BudgetCanvas() {
  const cloud = useQuery(api.canvasScenes.get);
  const upsert = useMutation(api.canvasScenes.upsert);
  const importIfEmpty = useMutation(api.canvasScenes.importIfEmpty);

  const [apiRef, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(0);
  const allowSave = useRef(false);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (cloud === undefined || bootstrapped.current) return;
    bootstrapped.current = true;

    if (cloud?.sceneJson) {
      const parsed = parseSceneJson(cloud.sceneJson);
      setInitialData(parsed ?? { elements: [], scrollToContent: true });
      writeLocalScene(cloud.sceneJson);
      markMigrated();
      setReady(true);
      allowSave.current = true;
      return;
    }

    const localRaw = loadStoredSceneRaw();
    const local = localRaw ? parseSceneJson(localRaw) : null;
    setInitialData(local ?? { elements: [], scrollToContent: true });
    setReady(true);
    allowSave.current = true;

    if (isMigrated() || !localRaw) {
      markMigrated();
      return;
    }

    void importIfEmpty({ sceneJson: localRaw })
      .then(() => markMigrated())
      .catch(() => {
        // Keep local cache; next visit retries import.
      });
  }, [cloud, importIfEmpty]);

  const onChange = useCallback<
    NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>
  >(
    (elements, appState, files) => {
      if (!allowSave.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        let sceneJson: string;
        try {
          sceneJson = serializeAsJSON(elements, appState, files, "local");
        } catch {
          return;
        }
        writeLocalScene(sceneJson);
        void upsert({ sceneJson }).catch(() => {
          // Keep localStorage; next edit retries cloud save.
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [upsert],
  );

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        Loading canvas…
      </div>
    );
  }

  return (
    <CanvasApiContext.Provider value={apiRef}>
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
