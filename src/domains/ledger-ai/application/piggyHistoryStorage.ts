// Browser-local encrypted storage. The device key stays on this browser; this
// is not cross-device sync or protection against code running on this origin.
const DB_NAME = "jayrr-piggy-history-v1";
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("keys");
      request.result.createObjectStore("history");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function read<T>(store: string, id: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
async function write(store: string, id: string, value: unknown, add = false) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    if (add) tx.objectStore(store).add(value, id);
    else tx.objectStore(store).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
async function deviceKey(owner: string) {
  const existing = await read<CryptoKey>("keys", owner);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  try { await write("keys", owner, key, true); return key; }
  catch (error) {
    // Another chat/browser tab may have created the same owner's key first.
    const winner = await read<CryptoKey>("keys", owner);
    if (winner) return winner;
    throw error;
  }
}
export function piggyHistoryKey(owner: string, scope: string) {
  return JSON.stringify([owner, scope]);
}
export async function readPiggyHistory(owner: string, scope: string): Promise<unknown> {
  const id = piggyHistoryKey(owner, scope);
  await writes.get(id);
  const stored = await read<{ iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }>("history", id);
  if (!stored) return undefined;
  const key = await deviceKey(owner);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv, additionalData: new TextEncoder().encode(id) }, key, stored.ciphertext);
  return JSON.parse(new TextDecoder().decode(bytes));
}
const writes = new Map<string, Promise<void>>();
export function writePiggyHistory(owner: string, scope: string, value: unknown) {
  const id = piggyHistoryKey(owner, scope);
  // Snapshot now, so subsequent streaming mutations can't change this write.
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const operation = (writes.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const key = await deviceKey(owner);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, bytes);
    await write("history", id, { iv, ciphertext });
  });
  writes.set(id, operation);
  void operation.finally(() => { if (writes.get(id) === operation) writes.delete(id); }).catch(() => {});
  return operation;
}
