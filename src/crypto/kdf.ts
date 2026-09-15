import argon2 from "argon2-browser";
import { toArrayBuffer } from "./bytes";
import type { Argon2Params } from "./types";

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  algorithm: "argon2id",
  version: 19,
  timeCost: 3,
  memoryCost: 64 * 1024,
  parallelism: 1,
  hashLength: 32,
};

export async function deriveKeyBytes(
  secret: string | Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  const result = await argon2.hash({
    pass: secret,
    salt,
    type: argon2.ArgonType.Argon2id,
    time: params.timeCost,
    mem: params.memoryCost,
    parallelism: params.parallelism,
    hashLen: params.hashLength,
    version: params.version,
  });
  return new Uint8Array(result.hash);
}

export async function deriveKey(
  secret: string | Uint8Array,
  salt: Uint8Array,
  params?: Argon2Params,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(await deriveKeyBytes(secret, salt, params)),
    "AES-KW",
    false,
    ["wrapKey", "unwrapKey"],
  );
}
