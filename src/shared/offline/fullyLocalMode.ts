/** Device setting: ledger ciphertext stays in IndexedDB and is not uploaded. */

const STORAGE_KEY = "jayrr-budget.fully-local";

const listeners = new Set<() => void>();

export function isFullyLocal() {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFullyLocal(enabled: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

export function subscribeFullyLocal(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
