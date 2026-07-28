/**
 * Minimal stale-while-revalidate cache for Supabase reads.
 *
 * Round trips to Supabase cost ~450ms before any query work happens, so every
 * navigation that refetches data the user just looked at shows a spinner for
 * half a second or more. This keeps the last result per key so a screen can
 * paint immediately and refresh in the background.
 *
 * It also dedupes concurrent requests for the same key, which matters when a
 * screen mounts twice in quick succession (tab focus, remount on resize).
 */

type CacheEntry<T> = {
  value: T;
  storedAt: number;
  inflight?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

/** Default window during which a cached value is served without refetching. */
export const DEFAULT_STALE_MS = 30_000;

export function getCached<T>(key: string, maxAgeMs = DEFAULT_STALE_MS): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > maxAgeMs) return undefined;
  return entry.value;
}

/** Last known value regardless of age, for painting a screen before revalidating. */
export function peekCached<T>(key: string): T | undefined {
  return (cache.get(key) as CacheEntry<T> | undefined)?.value;
}

export function setCached<T>(key: string, value: T): void {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  cache.set(key, { value, storedAt: Date.now(), inflight: existing?.inflight });
}

export function invalidateCache(keyOrPrefix: string, { prefix = false } = {}): void {
  if (!prefix) {
    cache.delete(keyOrPrefix);
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(keyOrPrefix)) cache.delete(key);
  }
}

/**
 * Runs `fetcher` unless a fresh value is cached, sharing a single in-flight
 * request between concurrent callers.
 */
export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  { maxAgeMs = DEFAULT_STALE_MS, force = false }: { maxAgeMs?: number; force?: boolean } = {}
): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!force && entry) {
    if (Date.now() - entry.storedAt <= maxAgeMs) return entry.value;
    if (entry.inflight) return entry.inflight;
  } else if (entry?.inflight) {
    return entry.inflight;
  }

  const inflight = (async () => {
    try {
      const value = await fetcher();
      cache.set(key, { value, storedAt: Date.now() });
      return value;
    } catch (error) {
      const current = cache.get(key) as CacheEntry<T> | undefined;
      if (current) cache.set(key, { value: current.value, storedAt: current.storedAt });
      throw error;
    }
  })();

  cache.set(key, {
    value: (entry?.value ?? undefined) as T,
    storedAt: entry?.storedAt ?? 0,
    inflight,
  });

  return inflight;
}
