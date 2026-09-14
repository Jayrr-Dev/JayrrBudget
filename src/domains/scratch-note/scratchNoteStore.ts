"use client";

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

export type ScratchNoteRow = {
  id: string;
  name: string;
  spend: number;
  count: number;
  currency: string;
  parent?: string;
};

export type ScratchNoteTab = {
  id: string;
  name: string;
  rows: ScratchNoteRow[];
};

export type ScratchNoteState = {
  tabs: ScratchNoteTab[];
  /** Tab currently shown in the note popover. */
  activeId: string;
  /** Tab that receives Analysis + adds (checkbox). */
  receiveId: string;
};

const STORAGE_KEY = "jayrr-budget.scratch-note-v2";
const LEGACY_STORAGE_KEY = "jayrr-budget.scratch-note-table";
const MIGRATED_KEY = "jayrr-budget.scratch-note-migrated-convex";
const OPEN_EVENT = "jayrr-scratch-note-open";

const EMPTY_STATE: ScratchNoteState = {
  tabs: [{ id: "tab-1", name: "Sheet 1", rows: [] }],
  activeId: "tab-1",
  receiveId: "tab-1",
};

function isRow(value: unknown): value is ScratchNoteRow {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as ScratchNoteRow).id === "string" &&
    typeof (value as ScratchNoteRow).name === "string" &&
    typeof (value as ScratchNoteRow).spend === "number"
  );
}

function isTab(value: unknown): value is ScratchNoteTab {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as ScratchNoteTab).id === "string" &&
    typeof (value as ScratchNoteTab).name === "string" &&
    Array.isArray((value as ScratchNoteTab).rows) &&
    (value as ScratchNoteTab).rows.every(isRow)
  );
}

function readLocalStorageState(): ScratchNoteState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScratchNoteState>;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0 && parsed.tabs.every(isTab)) {
        const tabs = parsed.tabs;
        const activeId =
          typeof parsed.activeId === "string" &&
          tabs.some((t) => t.id === parsed.activeId)
            ? parsed.activeId
            : tabs[0]!.id;
        const receiveId =
          typeof parsed.receiveId === "string" &&
          tabs.some((t) => t.id === parsed.receiveId)
            ? parsed.receiveId
            : activeId;
        return { tabs, activeId, receiveId };
      }
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const rows = JSON.parse(legacy) as unknown;
      if (Array.isArray(rows) && rows.every(isRow)) {
        const id = "tab-1";
        return {
          tabs: [{ id, name: "Sheet 1", rows }],
          activeId: id,
          receiveId: id,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function clearLocalStorageNotes() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // ignore
  }
}

function openNotePopover() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }
}

/** Live note pad from Convex (falls back to empty while loading). */
export function useScratchNote(): ScratchNoteState {
  const data = useQuery(api.scratchNotes.get);
  return data ?? EMPTY_STATE;
}

/** One-shot localStorage → Convex when cloud pad still empty. */
export function useScratchNoteLocalMigration() {
  const importIfEmpty = useMutation(api.scratchNotes.importIfEmpty);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || typeof window === "undefined") return;
    if (localStorage.getItem(MIGRATED_KEY) === "1") {
      ran.current = true;
      return;
    }
    const local = readLocalStorageState();
    if (!local) {
      try {
        localStorage.setItem(MIGRATED_KEY, "1");
      } catch {
        // ignore
      }
      ran.current = true;
      return;
    }
    ran.current = true;
    void importIfEmpty(local)
      .then(() => clearLocalStorageNotes())
      .catch(() => {
        ran.current = false;
      });
  }, [importIfEmpty]);
}

export function useScratchNoteActions() {
  const addRowMut = useMutation(api.scratchNotes.addRow);
  const removeRowMut = useMutation(api.scratchNotes.removeRow);
  const clearActiveMut = useMutation(api.scratchNotes.clearActive);
  const selectTabMut = useMutation(api.scratchNotes.selectTab);
  const setReceiveTabMut = useMutation(api.scratchNotes.setReceiveTab);
  const addTabMut = useMutation(api.scratchNotes.addTab);
  const closeTabMut = useMutation(api.scratchNotes.closeTab);
  const renameTabMut = useMutation(api.scratchNotes.renameTab);

  return {
    addRow: async (
      input: Omit<ScratchNoteRow, "id"> & { id?: string },
    ) => {
      await addRowMut({
        name: input.name,
        spend: input.spend,
        count: input.count,
        currency: input.currency,
        parent: input.parent,
        id: input.id,
      });
      openNotePopover();
    },
    removeRow: (rowId: string) => void removeRowMut({ rowId }),
    clearActive: () => void clearActiveMut({}),
    selectTab: (tabId: string) => void selectTabMut({ tabId }),
    setReceiveTab: (tabId: string) => void setReceiveTabMut({ tabId }),
    addTab: () => void addTabMut({}),
    closeTab: (tabId: string) => void closeTabMut({ tabId }),
    renameTab: (tabId: string, name: string) =>
      void renameTabMut({ tabId, name }),
  };
}

export function subscribeScratchNoteOpen(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
