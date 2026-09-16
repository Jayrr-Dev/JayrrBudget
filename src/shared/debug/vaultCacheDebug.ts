/** In-memory ring log for vault ciphertext cache / read debugging (admin UI). */

export type VaultCacheDebugKind =
  | "cache-hit"
  | "cache-miss"
  | "cache-write"
  | "network-read"
  | "decrypt";

export type VaultCacheDebugEvent = {
  id: number;
  at: number;
  kind: VaultCacheDebugKind;
  message: string;
  detail?: Record<string, string | number | boolean | null>;
};

const MAX_EVENTS = 200;
const STORAGE_KEY = "jayrr-vault-cache-debug";

let seq = 0;
let capturing = false;
const events: VaultCacheDebugEvent[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function readStoredCapturing(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredCapturing(next: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, "1");
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

if (typeof window !== "undefined") {
  capturing = readStoredCapturing();
}

export function isVaultCacheDebugCapturing() {
  return capturing;
}

export function setVaultCacheDebugCapturing(next: boolean) {
  capturing = next;
  writeStoredCapturing(next);
  notify();
}

export function logVaultCacheDebug(
  kind: VaultCacheDebugKind,
  message: string,
  detail?: Record<string, string | number | boolean | null>,
) {
  if (!capturing) return;
  seq += 1;
  events.unshift({
    id: seq,
    at: Date.now(),
    kind,
    message,
    detail,
  });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  notify();
}

export function getVaultCacheDebugEvents(): readonly VaultCacheDebugEvent[] {
  return events;
}

export function clearVaultCacheDebugEvents() {
  events.length = 0;
  notify();
}

export function subscribeVaultCacheDebug(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
