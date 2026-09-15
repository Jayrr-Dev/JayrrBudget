import "server-only";

import { createHash } from "node:crypto";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import {
  cachedRead,
  DEFAULT_READ_TTL_MS,
  invalidateReadCache,
  SHORT_READ_TTL_MS,
} from "@/shared/db/readCache";

export { DEFAULT_READ_TTL_MS, SHORT_READ_TTL_MS };

function tokenScope(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex").slice(0, 24);
  return `convex:${digest}`;
}

async function currentScope(): Promise<string | null> {
  const token = await convexAuthNextjsToken();
  if (!token) return null;
  return tokenScope(token);
}

function cacheOkResult<T>(value: T): boolean {
  if (value && typeof value === "object" && "ok" in value) {
    return (value as { ok: boolean }).ok === true;
  }
  return true;
}

/** Cache a per-user Convex HTTP read until TTL or invalidateConvexUserCache. */
export async function cachedConvexRead<T>(options: {
  name: string;
  args?: unknown;
  ttlMs?: number;
  load: () => Promise<T>;
  shouldCache?: (value: T) => boolean;
}): Promise<T> {
  const scope = await currentScope();
  if (!scope) {
    return options.load();
  }
  const argsKey =
    options.args === undefined ? "" : JSON.stringify(options.args);
  return cachedRead({
    key: `${scope}:${options.name}:${argsKey}`,
    ttlMs: options.ttlMs,
    load: options.load,
    shouldCache: options.shouldCache ?? cacheOkResult,
  });
}

export async function invalidateConvexUserCache() {
  const scope = await currentScope();
  if (!scope) {
    invalidateReadCache("convex:");
    return;
  }
  invalidateReadCache(scope);
}
