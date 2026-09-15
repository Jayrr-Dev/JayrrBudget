let pendingPasscode: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setPendingPasscode(passcode: string) {
  pendingPasscode = passcode;
  notify();
}

export function peekPendingPasscode() {
  return pendingPasscode;
}

export function clearPendingPasscode() {
  pendingPasscode = null;
  notify();
}

export function subscribePendingPasscode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
