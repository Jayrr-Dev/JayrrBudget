/** IndexedDB last-view for plaintext dashboard + sidebar. Not vault ciphertext. */

import type { DashboardData } from "@/domains/dashboard/domain/types";
import type { AppModuleRecord } from "@/domains/modules/domain/types";

const DB_NAME = "jayrr-budget-last-view";
const DB_VERSION = 1;
const STORE = "lastViews";
const LAST_USER_KEY = "jayrr-budget.last-user-id";
const ENCRYPTED_LEDGER_KEY = "jayrr-budget.encrypted-ledger";

export type LastViewRecord = {
  v: 1;
  userId: string;
  savedAt: number;
  dashboard: DashboardData | null;
  modules: AppModuleRecord[] | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open last-view cache."));
  });
}

export function readLastUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

export function writeLastUserId(userId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // ignore
  }
}

export function clearLastUserId() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // ignore
  }
}

export function rememberEncryptedLedgerLocal(enabled: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (enabled) localStorage.setItem(ENCRYPTED_LEDGER_KEY, "1");
    else localStorage.removeItem(ENCRYPTED_LEDGER_KEY);
  } catch {
    // ignore
  }
}

export function peekEncryptedLedgerLocal() {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(ENCRYPTED_LEDGER_KEY) === "1";
  } catch {
    return false;
  }
}

export async function readLastView(
  userId: string,
): Promise<LastViewRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE, "readonly")
          .objectStore(STORE)
          .get(userId);
        request.onsuccess = () => {
          const value = request.result as LastViewRecord | undefined;
          resolve(value?.v === 1 ? value : null);
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Could not read last-view cache."));
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function upsertLastView(input: {
  userId: string;
  dashboard?: DashboardData;
  modules?: AppModuleRecord[];
}): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const existing = await readLastView(input.userId);
    const dashboard = input.dashboard ?? existing?.dashboard ?? null;
    const modules = input.modules ?? existing?.modules ?? null;
    if (!dashboard && !modules) return;
    const record: LastViewRecord = {
      v: 1,
      userId: input.userId,
      savedAt: Date.now(),
      dashboard,
      modules,
    };
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .put(record, input.userId);
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            request.error ?? new Error("Could not write last-view cache."),
          );
      });
    } finally {
      db.close();
    }
  } catch {
    // Best-effort. Live Convex still works when online.
  }
}

export async function clearLastView(userId?: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        const request = userId ? store.delete(userId) : store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            request.error ?? new Error("Could not clear last-view cache."),
          );
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}

export async function clearPersistedLastView(): Promise<void> {
  const userId = readLastUserId();
  await clearLastView(userId ?? undefined);
  clearLastUserId();
  rememberEncryptedLedgerLocal(false);
}
