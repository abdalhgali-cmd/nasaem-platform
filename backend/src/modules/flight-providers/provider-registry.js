// Issue #109 — airline providers the agency may connect, and the mode each
// one is allowed to run in. A provider is never LIVE because credentials
// exist: it also needs a reviewed adapter for that provider's real API and
// the owner's explicit approval flag. Until then every provider is
// REQUEST_ONLY — search results come from the agency's own inventory and
// staff book by hand (flight-bookings), exactly as today.

export const PROVIDERS = [
  { code: "TARCO", name: "تاركو للطيران" },
  { code: "BADR", name: "بدر للطيران" },
  { code: "SUDAN_AIRWAYS", name: "الخطوط الجوية السودانية (سودانير)" },
  { code: "NDC", name: "موزع NDC" },
];

export const PROVIDER_MODES = { REQUEST_ONLY: "REQUEST_ONLY", SANDBOX: "SANDBOX", LIVE: "LIVE" };

// Adapters reviewed against a provider's real, documented API. Empty on
// purpose: no agreement, documentation or credentials for any provider are
// on record (docs/FLIGHT_PROVIDERS.md). Register one only together with
// its contract tests.
const ADAPTERS = new Map();

export function registerProviderAdapter(code, adapter) {
  ADAPTERS.set(code, adapter);
}

export function unregisterProviderAdapter(code) {
  ADAPTERS.delete(code);
}

function envKey(code, suffix) {
  return `FLIGHT_PROVIDER_${code}_${suffix}`;
}

// The reason is what staff see; it never contains URLs or credentials.
export function providerStatus(code, env = process.env) {
  const provider = PROVIDERS.find((p) => p.code === code);
  if (!provider) return null;
  const adapter = ADAPTERS.get(code) ?? null;
  const hasCredentials = Boolean(env[envKey(code, "URL")] && env[envKey(code, "TOKEN")]);
  const environment = String(env[envKey(code, "ENV")] || "").toLowerCase();
  const liveApproved = env[envKey(code, "LIVE_APPROVED")] === "yes";

  const base = { code, name: provider.name, adapter: Boolean(adapter), credentials: hasCredentials };
  if (!adapter) return { ...base, mode: PROVIDER_MODES.REQUEST_ONLY, reason: "NO_VERIFIED_INTEGRATION" };
  if (!hasCredentials) return { ...base, mode: PROVIDER_MODES.REQUEST_ONLY, reason: "NO_CREDENTIALS" };
  if (environment === "sandbox") return { ...base, mode: PROVIDER_MODES.SANDBOX, reason: "SANDBOX_ONLY" };
  if (environment !== "production" || !liveApproved) {
    return { ...base, mode: PROVIDER_MODES.REQUEST_ONLY, reason: "LIVE_NOT_APPROVED" };
  }
  return { ...base, mode: PROVIDER_MODES.LIVE, reason: null };
}

export function listProviderStatuses(env = process.env) {
  return PROVIDERS.map((p) => providerStatus(p.code, env));
}

export function providerConfig(code, env = process.env) {
  return {
    url: env[envKey(code, "URL")] || null,
    token: env[envKey(code, "TOKEN")] || null,
    timeoutMs: Number(env[envKey(code, "TIMEOUT_MS")]) || 15_000,
  };
}

export function getProviderAdapter(code) {
  return ADAPTERS.get(code) ?? null;
}
