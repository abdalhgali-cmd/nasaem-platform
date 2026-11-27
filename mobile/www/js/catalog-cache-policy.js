// Public-catalog fallback policy. Booking decisions MUST use freshly retrieved
// server data, never a cached amount or availability claim.
export function recoverCatalogOnFailure(error, cached, { fresh = false } = {}) {
  if (fresh || !cached) throw error;
  return { ...cached, stale: true };
}
