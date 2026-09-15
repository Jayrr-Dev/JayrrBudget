import { randomBytes, toArrayBuffer } from "./bytes";
import type { EncryptedEnvelopeV1, EnvelopeKind } from "./types";

function aadFor(input: { userId: string; recordId: string; kind: EnvelopeKind; keyId: string }): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, ...input }));
}

export async function encryptJson(
  value: unknown,
  input: { userId: string; recordId: string; kind: EnvelopeKind; keyId: string },
  masterKey: CryptoKey,
): Promise<EncryptedEnvelopeV1> {
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = randomBytes(12);
  const ivBuffer = toArrayBuffer(iv);
  const aad = toArrayBuffer(aadFor(input));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer, additionalData: aad },
    dek,
    new TextEncoder().encode(JSON.stringify(value)).buffer,
  );
  const wrappedDek = await crypto.subtle.wrapKey("raw", dek, masterKey, "AES-KW");
  return { v: 1, alg: "AES-256-GCM", ...input, iv: ivBuffer, wrappedDek, ciphertext };
}

export async function decryptJson<T>(envelope: EncryptedEnvelopeV1, input: { userId: string; recordId: string; kind: EnvelopeKind; keyId: string }, masterKey: CryptoKey): Promise<T> {
  const dek = await crypto.subtle.unwrapKey("raw", envelope.wrappedDek, masterKey, "AES-KW", { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: envelope.iv, additionalData: toArrayBuffer(aadFor(input)) }, dek, envelope.ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function envelopeMetadata(envelope: EncryptedEnvelopeV1) {
  return { v: envelope.v, alg: envelope.alg, keyId: envelope.keyId, kind: envelope.kind, recordId: envelope.recordId, iv: envelope.iv, wrappedDek: envelope.wrappedDek, ciphertext: envelope.ciphertext };
}
