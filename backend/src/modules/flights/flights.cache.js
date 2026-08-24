// Platform 3.0 Phase 12 — the "Cache" step in the plan's own preferred
// architecture (Provider → Adapter → Normalization → Cache → API →
// Website). Deliberately NOT inside trip.provider.js: that file is the
// Trip.com integration itself and the plan's non-negotiable rules say
// never modify it. This is a thin wrapper around the call site instead —
// it changes nothing about what Trip.com is asked or what comes back,
// it only avoids repeating an identical outbound request within a short
// window (e.g. a user re-submitting the same search, or two tabs).
//
// Short TTL on purpose: flight prices/availability are time-sensitive,
// so this smooths out duplicate identical requests without risking a
// meaningfully stale quote.
const CACHE_TTL_MS = 3 * 60 * 1000;

const cache = new Map();

export async function withTripSearchCache(cacheKey, fetcher) {
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await fetcher();
  cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

export function clearTripSearchCache() {
  cache.clear();
}
