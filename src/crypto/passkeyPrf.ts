import { base64ToBytes, bytesToBase64, randomBytes, toArrayBuffer } from "./bytes";
import { MASTER_WRAP_ALG, MASTER_WRAP_USAGES } from "./masterKey";

function toBase64Url(bytes: ArrayBuffer): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

async function vaultSalt(vaultId: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jayrr-budget-vault-prf-v1:${vaultId}`).buffer);
}

async function wrapWithPrf(masterKey: CryptoKey, prf: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", prf, "AES-KW", false, ["wrapKey"]);
  return crypto.subtle.wrapKey("raw", masterKey, key, "AES-KW");
}

async function unwrapWithPrf(wrapped: ArrayBuffer, prf: ArrayBuffer): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey("raw", prf, "AES-KW", false, ["unwrapKey"]);
  return crypto.subtle.unwrapKey("raw", wrapped, key, "AES-KW", MASTER_WRAP_ALG, true, MASTER_WRAP_USAGES);
}

function prfFromCredential(credential: Credential | null): ArrayBuffer {
  const result = (credential as PublicKeyCredential | null)?.getClientExtensionResults?.() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined;
  const prf = result?.prf?.results?.first;
  if (!prf) throw new Error("This passkey does not support encryption unlock.");
  return prf;
}

export async function registerPasskey(masterKey: CryptoKey, vaultId: string) {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("Passkeys are not supported in this browser.");
  const salt = await vaultSalt(vaultId);
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: toArrayBuffer(randomBytes(32)),
    rp: { name: "Jayrr's Budget", id: window.location.hostname },
    user: { id: toArrayBuffer(randomBytes(16)), name: `vault-${vaultId}`, displayName: "Jayrr's Budget" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    timeout: 60_000,
    extensions: { prf: { eval: { first: salt } } },
  } as PublicKeyCredentialCreationOptions });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey registration was cancelled.");
  const prf = prfFromCredential(credential);
  return { credentialId: toBase64Url(credential.rawId), wrappedMasterKey: await wrapWithPrf(masterKey, prf) };
}

export async function unlockWithPasskey(credentialId: string, wrappedMasterKey: ArrayBuffer, vaultId: string) {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("Passkeys are not supported in this browser.");
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: toArrayBuffer(randomBytes(32)),
    rpId: window.location.hostname,
    allowCredentials: [{ id: toArrayBuffer(fromBase64Url(credentialId)), type: "public-key" }],
    userVerification: "required",
    timeout: 60_000,
    extensions: { prf: { eval: { first: await vaultSalt(vaultId) } } },
  } as PublicKeyCredentialRequestOptions });
  return unwrapWithPrf(wrappedMasterKey, prfFromCredential(credential));
}
