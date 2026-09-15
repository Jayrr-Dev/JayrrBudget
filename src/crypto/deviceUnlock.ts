import { base64ToBytes, bytesToBase64, randomBytes, toArrayBuffer } from "./bytes";

const DB_NAME = "jayrr-budget-vault";
const STORE = "deviceUnlock";
const RECORD_KEY = "current";

type DeviceUnlockRecord = {
  v: 1;
  vaultId: string;
  deviceKey: string;
  wrappedMasterKey: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open vault device storage."));
  });
}

async function readRecord(): Promise<DeviceUnlockRecord | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_KEY);
      request.onsuccess = () => resolve((request.result as DeviceUnlockRecord | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read vault device storage."));
    });
  } finally {
    db.close();
  }
}

async function writeRecord(record: DeviceUnlockRecord) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(record, RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not save vault device storage."));
    });
  } finally {
    db.close();
  }
}

async function wrapKeyFromRaw(raw: ArrayBuffer) {
  return crypto.subtle.importKey("raw", raw, "AES-KW", false, ["wrapKey", "unwrapKey"]);
}

/** Stores a device wrap so this browser can re-key the vault after a login password reset. */
export async function rememberDeviceUnlock(vaultId: string, masterKey: CryptoKey) {
  if (typeof indexedDB === "undefined") return;
  const deviceKey = randomBytes(32);
  const wrappedMasterKey = await crypto.subtle.wrapKey("raw", masterKey, await wrapKeyFromRaw(toArrayBuffer(deviceKey)), "AES-KW");
  await writeRecord({
    v: 1,
    vaultId,
    deviceKey: bytesToBase64(deviceKey),
    wrappedMasterKey: bytesToBase64(wrappedMasterKey),
  });
}

export async function unlockMasterKeyFromDevice(vaultId: string): Promise<CryptoKey | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const record = await readRecord();
    if (!record || record.v !== 1 || record.vaultId !== vaultId) return null;
    return await crypto.subtle.unwrapKey(
      "raw",
      toArrayBuffer(base64ToBytes(record.wrappedMasterKey)),
      await wrapKeyFromRaw(toArrayBuffer(base64ToBytes(record.deviceKey))),
      "AES-KW",
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}
