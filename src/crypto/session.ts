let activeMasterKey: CryptoKey | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function unlockVault(masterKey: CryptoKey) {
  activeMasterKey = masterKey;
  notify();
}

export function lockVault() {
  activeMasterKey = null;
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
