// Which kind of deployment this server is, for labels only (never for access
// decisions; staging-only writes use staging-guard.js).
//
// A server is the production deployment only when NODE_ENV is "production"
// and DEPLOYMENT_ENVIRONMENT is unset or "production". Staging sets
// DEPLOYMENT_ENVIRONMENT=staging, and local/test runs are not "production".
// Everywhere else the service prices and exchange rates are development/test
// data (owner decision 2026-11-01): they stay editable from the admin
// dashboard and are labelled as test data to staff and customers.
export function deploymentName(env = process.env) {
  const declared = String(env.DEPLOYMENT_ENVIRONMENT || "").trim().toLowerCase();
  if (env.NODE_ENV !== "production") return declared && declared !== "production" ? declared : String(env.NODE_ENV || "development");
  return declared || "production";
}

export function isProductionDeployment(env = process.env) {
  return deploymentName(env) === "production";
}

// Even on production the prices are development/test data until the owner
// approves them (owner decision 2026-11-02): only PRICES_APPROVED=true, set on
// the production service when the final prices are entered, drops the
// test-data label. Any other value, or none, keeps it.
export function pricesAreTestData(env = process.env) {
  if (!isProductionDeployment(env)) return true;
  return String(env.PRICES_APPROVED || "").trim().toLowerCase() !== "true";
}
