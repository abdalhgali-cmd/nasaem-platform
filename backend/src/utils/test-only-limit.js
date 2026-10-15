// Rate limits that an environment variable may raise only in tests and
// local development.
//
// Production policy is the default passed in. The variable is read only
// when the process runs as NODE_ENV=test (unit/integration tests) or
// NODE_ENV=development (local runs and the browser E2E backend, which
// Playwright and CI start with NODE_ENV=development). In any other
// environment — production, staging, or NODE_ENV unset — it is ignored, so
// setting it there by mistake changes nothing. Values that are not a whole
// number between 1 and 1000 are ignored too.
const TEST_ENVIRONMENTS = new Set(["test", "development"]);

export function resolveTestOnlyLimit(name, productionLimit, env = process.env) {
  if (!TEST_ENVIRONMENTS.has(env.NODE_ENV)) return productionLimit;
  const raw = String(env[name] ?? "").trim();
  if (!/^\d+$/.test(raw)) return productionLimit;
  const value = Number(raw);
  return value >= 1 && value <= 1000 ? value : productionLimit;
}
