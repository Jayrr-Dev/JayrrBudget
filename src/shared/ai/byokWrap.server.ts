import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const OPENROUTER_AAD = "openrouter:";
const JEV_AAD = "jev:";

export type ByokProvider = "openrouter" | "jev";

function wrapKeyBytes(): Buffer {
  const raw = process.env.AI_BYOK_WRAP_KEY?.trim();
  if (!raw) {
    throw new Error(
      "Missing AI_BYOK_WRAP_KEY. Add a 32-byte key to .env.local.",
    );
  }
  const buf =
    raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("AI_BYOK_WRAP_KEY must decode to 32 bytes.");
  }
  return buf;
}

export function isByokWrapConfigured() {
  try {
    wrapKeyBytes();
    return true;
  } catch {
    return false;
  }
}

export function isOpenRouterKeyShape(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("sk-or-") &&
    trimmed.length >= 32 &&
    trimmed.length <= 256
  );
}

export function openRouterKeyLast4(apiKey: string) {
  const compact = apiKey.trim().replace(/[^0-9a-zA-Z]/g, "");
  return compact.slice(-4);
}

function aadFor(provider: ByokProvider, userId: string) {
  const prefix = provider === "jev" ? JEV_AAD : OPENROUTER_AAD;
  return Buffer.from(`${prefix}${userId}`, "utf8");
}

export function isJevKeyShape(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 20 || trimmed.length > 256) return false;
  if (trimmed.startsWith("sk-or-")) return false;
  return /^[A-Za-z0-9_\-./+=]+$/.test(trimmed);
}

export function encryptByokKey(
  provider: ByokProvider,
  apiKey: string,
  userId: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrapKeyBytes(), iv);
  cipher.setAAD(aadFor(provider, userId));
  const encrypted = Buffer.concat([
    cipher.update(apiKey.trim(), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
  };
}

export function encryptOpenRouterKey(apiKey: string, userId: string) {
  return encryptByokKey("openrouter", apiKey, userId);
}

export function decryptByokKey(
  provider: ByokProvider,
  input: {
    userId: string;
    ciphertext: string;
    iv: string;
  },
) {
  const packed = Buffer.from(input.ciphertext, "base64");
  if (packed.length < 17) {
    throw new Error("Invalid encrypted key");
  }
  const tag = packed.subarray(packed.length - 16);
  const encrypted = packed.subarray(0, packed.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    wrapKeyBytes(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAAD(aadFor(provider, input.userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

export function decryptOpenRouterKey(input: {
  userId: string;
  ciphertext: string;
  iv: string;
}) {
  return decryptByokKey("openrouter", input);
}
