/** Browser cache of vault ciphertext only. Never stores plaintext ledger rows. */

const DB_NAME = "jayrr-budget-ciphertext";
const DB_VERSION = 1;
const STORE = "vaultSnapshots";

export type CachedCiphertextRecord = {
  recordId: string;
  kind: string;
  revision: number;
  keyId: string;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
  v: number;
  alg: string;
  iv: ArrayBuffer;
  wrappedDek: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

export type VaultCiphertextSnapshot = {
  v: 1;
  vaultId: string;
  userId: string;
  updatedAt: number;
  records: CachedCiphertextRecord[];
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
      reject(request.error ?? new Error("Could not open ciphertext cache."));
  });
}

function asArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength,
    );
  }
  throw new Error("Encrypted record bytes missing.");
}

/** Normalize a Convex listRecords row into a cacheable ciphertext envelope. */
export function toCachedCiphertextRecord(
  row: Record<string, unknown>,
): CachedCiphertextRecord | null {
  const recordId = String(row.recordId ?? "");
  if (!recordId) return null;
  try {
    return {
      recordId,
      kind: String(row.kind ?? ""),
      revision: Number(row.revision ?? 0),
      keyId: String(row.keyId ?? ""),
      deleted: Boolean(row.deleted),
      createdAt: Number(row.createdAt ?? 0),
      updatedAt: Number(row.updatedAt ?? 0),
      v: Number(row.v ?? 1),
      alg: String(row.alg ?? "AES-256-GCM"),
      iv: asArrayBuffer(row.iv),
      wrappedDek: asArrayBuffer(row.wrappedDek),
      ciphertext: asArrayBuffer(row.ciphertext),
    };
  } catch {
    return null;
  }
}

export async function readVaultCiphertextCache(
  vaultId: string,
): Promise<VaultCiphertextSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE, "readonly")
          .objectStore(STORE)
          .get(vaultId);
        request.onsuccess = () => {
          const value = request.result as VaultCiphertextSnapshot | undefined;
          resolve(value?.v === 1 ? value : null);
        };
        request.onerror = () =>
          reject(
            request.error ?? new Error("Could not read ciphertext cache."),
          );
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function writeVaultCiphertextCache(
  snapshot: VaultCiphertextSnapshot,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .put(snapshot, snapshot.vaultId);
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            request.error ?? new Error("Could not write ciphertext cache."),
          );
      });
    } finally {
      db.close();
    }
  } catch {
    // Cache is best-effort; network load still works.
  }
}

export async function clearVaultCiphertextCache(
  vaultId?: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        const request = vaultId ? store.delete(vaultId) : store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            request.error ?? new Error("Could not clear ciphertext cache."),
          );
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}
