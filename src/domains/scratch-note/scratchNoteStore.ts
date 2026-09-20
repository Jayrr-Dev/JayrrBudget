"use client";

import {
  saveEncryptedScratchPad,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import {
  clearSkipNextPrivateLedgerReload,
  skipNextPrivateLedgerReload,
  usePrivateLedger,
} from "@/domains/vault/ui/usePrivateLedger";
import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

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

const scratchUiListeners = new Set<() => void>();
let pendingScratch: ScratchNoteState | null = null;
let scratchRevision: number | null = null;
let scratchDirty = false;
let scratchWriteChain: Promise<void> = Promise.resolve();

type ScratchWriteDeps = {
  persist: (
    state: ScratchNoteState,
    expectedRevision: number | null,
  ) => Promise<number | null>;
  ledgerRevision: number | null;
  reload: () => void;
};

const scratchWriteDepsRef: { current: ScratchWriteDeps | null } = {
  current: null,
};

function notifyScratchUi() {
  for (const listener of scratchUiListeners) listener();
}

function padState(
  pad:
    | { tabs: ScratchNoteState["tabs"]; activeId: string; receiveId: string }
    | undefined,
): ScratchNoteState | null {
  if (!pad) return null;
  return { tabs: pad.tabs, activeId: pad.activeId, receiveId: pad.receiveId };
}

function isScratchConflict(cause: unknown) {
  return (
    cause instanceof Error &&
    cause.message.includes("Encrypted record conflict: scratch-main")
  );
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

function readLocalStorageState(): ScratchNoteState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScratchNoteState>;
      if (
        Array.isArray(parsed.tabs) &&
        parsed.tabs.length > 0 &&
        parsed.tabs.every(isTab)
      ) {
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

function applyAddRow(
  state: ScratchNoteState,
  input: Omit<ScratchNoteRow, "id"> & { id?: string },
): ScratchNoteState {
  const receive =
    state.tabs.find((tab) => tab.id === state.receiveId) ?? state.tabs[0];
  if (!receive) return state;

  const existing = receive.rows.find(
    (row) =>
      row.name === input.name &&
      (row.parent ?? "") === (input.parent ?? "") &&
      row.currency === input.currency,
  );
  const nextRow: ScratchNoteRow = existing
    ? { ...existing, spend: input.spend, count: input.count }
    : {
        id: input.id ?? crypto.randomUUID(),
        name: input.name,
        spend: input.spend,
        count: input.count,
        currency: input.currency,
        parent: input.parent,
      };
  const rows = existing
    ? receive.rows.map((row) => (row.id === existing.id ? nextRow : row))
    : [...receive.rows, nextRow];

  return {
    ...state,
    activeId: receive.id,
    tabs: state.tabs.map((tab) =>
      tab.id === receive.id ? { ...tab, rows } : tab,
    ),
  };
}

/** Live note pad from encrypted vault rows. */
export function useScratchNote(): ScratchNoteState {
  const privateLedger = usePrivateLedger();
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    scratchUiListeners.add(onChange);
    return () => {
      scratchUiListeners.delete(onChange);
    };
  }, []);
  useEffect(() => {
    const pad = privateLedger.ledger.scratchPads[0];
    if (!pendingScratch || scratchDirty) return;
    if (!pad || scratchRevision === null || pad.revision !== scratchRevision)
      return;
    pendingScratch = null;
    notifyScratchUi();
  }, [privateLedger.ledger, privateLedger.version]);
  if (pendingScratch) return pendingScratch;
  const pad = privateLedger.ledger.scratchPads[0];
  if (pad)
    return {
      tabs: pad.tabs,
      activeId: pad.activeId,
      receiveId: pad.receiveId,
    };
  return EMPTY_STATE;
}

/** Plaintext scratch migration is retired. */
export function useScratchNoteLocalMigration() {}

async function flushEncryptedScratch() {
  while (scratchDirty) {
    scratchDirty = false;
    const payload = pendingScratch;
    const deps = scratchWriteDepsRef.current;
    if (!payload || !deps) return;
    const expected = scratchRevision ?? deps.ledgerRevision;
    skipNextPrivateLedgerReload();
    try {
      const nextRevision = await deps.persist(payload, expected);
      scratchRevision = nextRevision ?? (expected ?? 0) + 1;
    } catch (cause) {
      if (!isScratchConflict(cause)) throw cause;
      const nextRevision = await deps.persist(payload, null);
      scratchRevision = nextRevision ?? (expected ?? 0) + 1;
    }
  }
}

function queueEncryptedScratch(next: ScratchNoteState) {
  pendingScratch = next;
  scratchDirty = true;
  notifyScratchUi();
  scratchWriteChain = scratchWriteChain
    .then(flushEncryptedScratch)
    .catch(() => {
      pendingScratch = null;
      scratchDirty = false;
      scratchRevision = null;
      clearSkipNextPrivateLedgerReload();
      notifyScratchUi();
      scratchWriteDepsRef.current?.reload();
    });
}

export function useScratchNoteActions() {
  const client = useConvex();
  const privateLedger = usePrivateLedger();

  scratchWriteDepsRef.current = {
    ledgerRevision: privateLedger.ledger.scratchPads[0]?.revision ?? null,
    reload: privateLedger.reload,
    persist: async (state, expectedRevision) => {
      const write = vaultWriteReady({
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (!write)
        throw new Error(
          "Sign in again so this browser can save scratch notes.",
        );
      return saveEncryptedScratchPad(write, {
        tabs: state.tabs,
        activeId: state.activeId,
        receiveId: state.receiveId,
        expectedRevision,
      });
    },
  };

  function persistEncrypted(next: ScratchNoteState) {
    queueEncryptedScratch(next);
  }

  function currentState(): ScratchNoteState {
    if (pendingScratch) return pendingScratch;
    return padState(privateLedger.ledger.scratchPads[0]) ?? EMPTY_STATE;
  }

  return {
    addRow: async (input: Omit<ScratchNoteRow, "id"> & { id?: string }) => {
      openNotePopover();
      persistEncrypted(applyAddRow(currentState(), input));
    },
    removeRow: (rowId: string) => {
      const state = currentState();
      void persistEncrypted({
        ...state,
        tabs: state.tabs.map((tab) => ({
          ...tab,
          rows: tab.rows.filter((row) => row.id !== rowId),
        })),
      });
    },
    clearActive: () => {
      const state = currentState();
      void persistEncrypted({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === state.activeId ? { ...tab, rows: [] } : tab,
        ),
      });
    },
    selectTab: (tabId: string) => {
      void persistEncrypted({ ...currentState(), activeId: tabId });
    },
    setReceiveTab: (tabId: string) => {
      void persistEncrypted({ ...currentState(), receiveId: tabId });
    },
    addTab: () => {
      const state = currentState();
      const id = crypto.randomUUID();
      void persistEncrypted({
        ...state,
        tabs: [
          ...state.tabs,
          { id, name: `Sheet ${state.tabs.length + 1}`, rows: [] },
        ],
        activeId: id,
      });
    },
    closeTab: (tabId: string) => {
      const state = currentState();
      if (state.tabs.length <= 1) return;
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      void persistEncrypted({
        tabs,
        activeId: state.activeId === tabId ? tabs[0]!.id : state.activeId,
        receiveId: state.receiveId === tabId ? tabs[0]!.id : state.receiveId,
      });
    },
    renameTab: (tabId: string, name: string) => {
      const state = currentState();
      void persistEncrypted({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, name } : tab,
        ),
      });
    },
  };
}

export function subscribeScratchNoteOpen(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
