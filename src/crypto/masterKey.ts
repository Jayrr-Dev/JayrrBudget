import { base64ToBytes, bytesToBase64, randomBytes } from "./bytes";
import { DEFAULT_ARGON2_PARAMS, deriveKey } from "./kdf";
import type { Argon2Params } from "./types";

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function wrapMasterKey(
  masterKey: CryptoKey,
  secret: string | Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey("raw", masterKey, await deriveKey(secret, salt, params), "AES-KW");
}

export async function unwrapMasterKey(
  wrapped: ArrayBuffer,
  secret: string | Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    await deriveKey(secret, salt, params),
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function createVaultKeyMaterial(passphrase: string) {
  const masterKey = await generateMasterKey();
  const passphraseSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const recoverySecret = randomBytes(32);
  const [passphraseWrapped, recoveryWrapped] = await Promise.all([
    wrapMasterKey(masterKey, passphrase, passphraseSalt),
    wrapMasterKey(masterKey, recoverySecret, recoverySalt),
  ]);
  return { masterKey, passphraseWrapped, passphraseSalt, recoveryWrapped, recoverySalt, recoverySecret, argon2: DEFAULT_ARGON2_PARAMS };
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(await crypto.subtle.exportKey("raw", key));
}

export async function importRawKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", base64ToBytes(value), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
