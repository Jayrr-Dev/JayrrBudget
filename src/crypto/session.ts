let activeMasterKey: CryptoKey | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function unlockVault(masterKey: CryptoKey) {
  activeMasterKey = masterKey;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(lockVault, 15 * 60 * 1000);
  notify();
}

export function lockVault() {
  activeMasterKey = null;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;
  notify();
}

export function getVaultMasterKey() {
  return activeMasterKey;
}

export function subscribeVaultSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
