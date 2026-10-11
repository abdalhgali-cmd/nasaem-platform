// Tracking-code (OTP) requests allowed per client per 15 minutes.
//
// Production policy: 5. TRACKING_CODE_RATE_LIMIT can raise it only when the
// process runs as NODE_ENV=test (unit/integration tests) or
// NODE_ENV=development (local runs and the browser E2E backend, which
// Playwright and CI start with NODE_ENV=development). In any other
// environment — production, staging, or NODE_ENV unset — the variable is
// ignored, so setting it there by mistake changes nothing. Values that are
// not a whole number between 1 and 1000 are ignored too.
export const PRODUCTION_TRACKING_CODE_LIMIT = 5;
const TEST_ENVIRONMENTS = new Set(["test", "development"]);

export function resolveTrackingCodeLimit(env = process.env) {
  if (!TEST_ENVIRONMENTS.has(env.NODE_ENV)) return PRODUCTION_TRACKING_CODE_LIMIT;
  const raw = String(env.TRACKING_CODE_RATE_LIMIT ?? "").trim();
  if (!/^\d+$/.test(raw)) return PRODUCTION_TRACKING_CODE_LIMIT;
  const value = Number(raw);
  return value >= 1 && value <= 1000 ? value : PRODUCTION_TRACKING_CODE_LIMIT;
}
