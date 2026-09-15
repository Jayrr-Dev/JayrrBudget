type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const store = new Map<string, CacheEntry>();

export const DEFAULT_READ_TTL_MS = 5 * 60_000;
export const SHORT_READ_TTL_MS = 30_000;

/**
 * Process-local TTL cache for expensive Convex HTTP reads.
 * Convex stays source of truth. This only skips repeat queries in the same
 * Node process until TTL or invalidate.
 */
export async function cachedRead<T>(options: {
  key: string;
  ttlMs?: number;
  load: () => Promise<T>;
  /** Skip storing failed / empty payloads. Default: always cache. */
  shouldCache?: (value: T) => boolean;
}): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_READ_TTL_MS;
  const hit = store.get(options.key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await options.load();
  if (!options.shouldCache || options.shouldCache(value)) {
    store.set(options.key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }
  return value;
}

export function invalidateReadCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** @deprecated Use cachedRead */
export const cachedTursoRead = cachedRead;

/** @deprecated Use invalidateReadCache */
export const invalidateTursoReadCache = invalidateReadCache;
