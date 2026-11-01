import "./env.js";
import fs from "fs";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Every API route must refuse an anonymous caller, unless it is deliberately
// public and listed below. A new route that forgets its guard fails this test.
process.env.API_RATE_LIMIT = "100000";
process.env.API_SESSION_RATE_LIMIT = "100000";
const { app, request } = await import("./helpers/api.js");

// "METHOD /api/path" — routes anonymous visitors may call, each protected by its
// own mechanism (validation, rate limit, unguessable token, phone/OTP ownership).
const STAGING_ONLY_ROUTES = new Set(["POST /api/admin/staging/attest", "POST /api/admin/staging/umrah-pricing"]);

const PUBLIC_ROUTES = new Set([
  "POST /api/customer-auth/register",
  "POST /api/customer-auth/login",
  "POST /api/customer-auth/logout",
  "POST /api/customer-auth/forgot-password",
  "POST /api/customer-auth/reset-password",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "POST /api/contact-requests",
  // Request-scoped payment step: no session, but a per-request token
  // (X-Payment-Access) is required — paymentAccess.test.js.
  "GET /api/contact-requests/:id/payment-access",
  "POST /api/contact-requests/:id/payment-access/receipt",
  "POST /api/tracking/request-code",
  "POST /api/tracking/verify-code",
  "POST /api/tracking/logout",
  "POST /api/intake-drafts",
  "GET /api/intake-drafts/:token",
  "PATCH /api/intake-drafts/:token",
  "POST /api/intake-drafts/:token/documents",
  "DELETE /api/intake-drafts/:token/documents/:documentId",
  "POST /api/intake-drafts/:token/submit",
  "GET /api/services/public",
  "GET /api/services/public/packages",
  "GET /api/services/:serviceId/requirements/public",
  "GET /api/visa-types/:visaTypeId/requirements/public",
  "GET /api/site-assets",
  "GET /api/site-assets/:key/file",
  "GET /api/flights/search",
  "GET /api/flights/rates",
  "POST /api/flight-bookings",
  "GET /api/flight-bookings/public/:id",
  "POST /api/flight-bookings/:id/payment-receipt",
  "GET /api/flight-bookings/:id/file/:kind",
  "GET /api/homepage/public",
  "GET /api/theme/public",
  "GET /api/settings/public",
  "GET /api/ferries/public",
  "GET /api/airlines/public",
  "GET /api/airports/search",
  "GET /api/feature-flags/public",
  "GET /api/health",
]);

async function collectRoutes() {
  const index = fs.readFileSync(new URL("../src/routes/index.js", import.meta.url), "utf8");
  const imports = Object.fromEntries([...index.matchAll(/import (\w+) from "(\.\.\/modules\/[^"]+)"/g)].map((m) => [m[1], m[2]]));
  const mounts = [...index.matchAll(/router\.use\("([^"]+)", (\w+)\)/g)].map((m) => ({ prefix: m[1], file: imports[m[2]] }));
  const routes = [];
  for (const { prefix, file } of mounts) {
    const router = (await import(new URL(`../src/routes/${file}`, import.meta.url))).default;
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: `/api${prefix}${layer.route.path === "/" ? "" : layer.route.path}` });
      }
    }
  }
  return routes;
}

describe("API authorization inventory", () => {
  test("every non-public route rejects an anonymous caller; every public route is listed on purpose", async () => {
    const routes = await collectRoutes();
    assert.ok(routes.length > 150, `route discovery looks broken (${routes.length})`);

    const open = [];
    for (const { method, path } of routes) {
      if (PUBLIC_ROUTES.has(`${method} ${path}`)) continue;
      const url = path.replace(/:\w+/g, "x");
      const res = await request(app)[method.toLowerCase()](url).set("X-Requested-With", "XMLHttpRequest").send({});
      // Staging-only operator routes answer 404 to anyone who cannot prove
      // the server's staging key (modules/staging-ops/staging-guard.js), so a
      // non-staging server does not even reveal them. 404 counts as refused
      // for these two routes only.
      const refused = STAGING_ONLY_ROUTES.has(`${method} ${path}`) ? [404] : [401, 403];
      if (!refused.includes(res.status)) open.push(`${method} ${path} -> ${res.status}`);
    }
    assert.deepEqual(open, [], "routes reachable without credentials and not in PUBLIC_ROUTES");
  });

  test("the public allow-list has no stale entries", async () => {
    const known = new Set((await collectRoutes()).map((r) => `${r.method} ${r.path}`));
    const stale = [...PUBLIC_ROUTES].filter((entry) => !known.has(entry) && entry !== "GET /api/health");
    assert.deepEqual(stale, []);
  });
});
