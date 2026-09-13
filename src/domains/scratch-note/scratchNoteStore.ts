"use client";

import { useSyncExternalStore } from "react";

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
const OPEN_EVENT = "jayrr-scratch-note-open";

const listeners = new Set<() => void>();
/** Stable SSR snapshot — must not allocate a new object each call. */
const SERVER_SNAPSHOT: ScratchNoteState = emptyState();
let state: ScratchNoteState = emptyState();
let hydrated = false;

function newId(prefix = "n") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyState(): ScratchNoteState {
  const id = "tab-1";
  return {
    tabs: [{ id, name: "Note 1", rows: [] }],
    activeId: id,
    receiveId: id,
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

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

function readFromStorage(): ScratchNoteState {
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

    // Migrate flat v1 row array into a single tab
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const rows = JSON.parse(legacy) as unknown;
      if (Array.isArray(rows) && rows.every(isRow)) {
        const id = "tab-1";
        return {
          tabs: [{ id, name: "Note 1", rows }],
          activeId: id,
          receiveId: id,
        };
      }
    }
  } catch {
    // fall through
  }
  return emptyState();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = readFromStorage();
}

function getSnapshot(): ScratchNoteState {
  ensureHydrated();
  return state;
}

function getServerSnapshot(): ScratchNoteState {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: ScratchNoteState) {
  state = next;
  persist();
  emit();
}

function openNotePopover() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }
}

export function useScratchNote() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addScratchNoteRow(
  input: Omit<ScratchNoteRow, "id"> & { id?: string },
) {
  ensureHydrated();
  const receiveId = state.receiveId;
  const tab = state.tabs.find((t) => t.id === receiveId);
  if (!tab) return;

  const existing = tab.rows.find(
    (row) =>
      row.name === input.name &&
      (row.parent ?? "") === (input.parent ?? "") &&
      row.currency === input.currency,
  );

  const nextRows = existing
    ? tab.rows.map((row) =>
        row.id === existing.id
          ? { ...row, spend: input.spend, count: input.count }
          : row,
      )
    : [
        ...tab.rows,
        {
          id:
            input.id ??
            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: input.name,
          spend: input.spend,
          count: input.count,
          currency: input.currency,
          parent: input.parent,
        },
      ];

  setState({
    ...state,
    activeId: receiveId,
    tabs: state.tabs.map((t) =>
      t.id === receiveId ? { ...t, rows: nextRows } : t,
    ),
  });
  openNotePopover();
}

export function removeScratchNoteRow(rowId: string) {
  ensureHydrated();
  setState({
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeId
        ? { ...tab, rows: tab.rows.filter((row) => row.id !== rowId) }
        : tab,
    ),
  });
}

/** Clears rows on the currently viewed tab. */
export function clearScratchNote() {
  ensureHydrated();
  setState({
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeId ? { ...tab, rows: [] } : tab,
    ),
  });
}

export function selectScratchNoteTab(tabId: string) {
  ensureHydrated();
  if (!state.tabs.some((t) => t.id === tabId)) return;
  setState({ ...state, activeId: tabId });
}

/** Checkbox: which tab receives Analysis + rows. */
export function setScratchNoteReceiveTab(tabId: string) {
  ensureHydrated();
  if (!state.tabs.some((t) => t.id === tabId)) return;
  setState({ ...state, receiveId: tabId });
}

export function addScratchNoteTab() {
  ensureHydrated();
  const id = newId("tab");
  const name = `Note ${state.tabs.length + 1}`;
  setState({
    tabs: [...state.tabs, { id, name, rows: [] }],
    activeId: id,
    receiveId: state.receiveId,
  });
}

export function closeScratchNoteTab(tabId: string) {
  ensureHydrated();
  if (state.tabs.length <= 1) return;
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  const activeId =
    state.activeId === tabId ? (tabs[0]?.id ?? state.activeId) : state.activeId;
  const receiveId =
    state.receiveId === tabId ? activeId : state.receiveId;
  setState({ tabs, activeId, receiveId });
}

export function renameScratchNoteTab(tabId: string, name: string) {
  ensureHydrated();
  const trimmed = name.trim();
  if (!trimmed) return;
  setState({
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, name: trimmed } : tab,
    ),
  });
}

export function subscribeScratchNoteOpen(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
