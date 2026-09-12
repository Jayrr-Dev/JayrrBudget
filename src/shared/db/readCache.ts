type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const store = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 5 * 60_000;

/**
 * Process-local TTL cache for expensive Turso reads.
 * Keeps Turso as source of truth — no second SQLite DB.
 */
export async function cachedTursoRead<T>(options: {
  key: string;
  ttlMs?: number;
  load: () => Promise<T>;
  /** Skip storing failed / empty payloads. Default: always cache. */
  shouldCache?: (value: T) => boolean;
}): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
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

export function invalidateTursoReadCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
