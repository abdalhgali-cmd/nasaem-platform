import "./env.js";
import fs from "fs";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.API_RATE_LIMIT = "100000";
process.env.API_SESSION_RATE_LIMIT = "100000";
const { createStaffUser, staffClient } = await import("./helpers/staff.js");
const { routeGuards } = await import("./helpers/routeInventory.js");

// tests/fixtures/rbac-baseline.json is the expected-permissions baseline:
// for every "METHOD /api/path", the staff roles allowed, or STAFF_ANY /
// CUSTOMER / TRACKING / PUBLIC. It is maintained by hand and reviewed like
// code — it is NOT regenerated from the routes. Any difference between it
// and the mounted routes fails the build: a protected route that loses its
// guard, a role list that grows (or shrinks), a new route nobody classified,
// or a classified route that disappeared. Changing a permission therefore
// means changing this file in the same pull request, visibly.
const ROLES = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"];
const BASELINE = JSON.parse(fs.readFileSync(new URL("./fixtures/rbac-baseline.json", import.meta.url), "utf8"));

function describeGuard(guard) {
  return Array.isArray(guard) ? `[${guard.join(", ")}]` : guard;
}

// Pure comparison, exercised below against deliberately broken inventories.
export function compareWithBaseline(baseline, actual) {
  const problems = [];
  for (const [route, expected] of Object.entries(baseline)) {
    if (!(route in actual)) {
      problems.push(`${route}: in the baseline but no longer mounted`);
      continue;
    }
    const got = actual[route];
    if (Array.isArray(expected) && !Array.isArray(got)) {
      problems.push(`${route}: lost its role guard (expected ${describeGuard(expected)}, now ${got})`);
    } else if (Array.isArray(expected)) {
      const added = got.filter((role) => !expected.includes(role));
      const removed = expected.filter((role) => !got.includes(role));
      if (added.length) problems.push(`${route}: roles expanded by ${added.join(", ")}`);
      if (removed.length) problems.push(`${route}: roles narrowed, ${removed.join(", ")} removed`);
    } else if (describeGuard(got) !== expected) {
      problems.push(`${route}: guard changed from ${expected} to ${describeGuard(got)}`);
    }
  }
  for (const route of Object.keys(actual)) {
    if (!(route in baseline)) problems.push(`${route}: new route not in the baseline (${describeGuard(actual[route])})`);
  }
  return problems;
}

describe("staff RBAC against the expected-permissions baseline", () => {
  test("the baseline itself is well-formed", () => {
    const allowed = new Set(["STAFF_ANY", "CUSTOMER", "TRACKING", "PUBLIC"]);
    for (const [route, guard] of Object.entries(BASELINE)) {
      assert.match(route, /^(GET|POST|PATCH|PUT|DELETE) \/api\//, route);
      if (Array.isArray(guard)) {
        assert.ok(guard.length > 0, `${route}: empty role list`);
        for (const role of guard) assert.ok(ROLES.includes(role), `${route}: unknown role ${role}`);
        assert.ok(guard.includes("SUPER_ADMIN"), `${route}: SUPER_ADMIN is always allowed on staff routes`);
      } else {
        assert.ok(allowed.has(guard), `${route}: unknown guard ${guard}`);
      }
    }
  });

  test("the comparison catches a lost guard, an expanded role list, and an unclassified route", () => {
    const baseline = { "POST /api/x/:id/pay": ["ACCOUNTANT", "SUPER_ADMIN"], "GET /api/x": "STAFF_ANY" };
    assert.deepEqual(compareWithBaseline(baseline, { ...baseline }), []);
    assert.match(compareWithBaseline(baseline, { ...baseline, "POST /api/x/:id/pay": "PUBLIC" })[0], /lost its role guard/);
    assert.match(compareWithBaseline(baseline, { ...baseline, "POST /api/x/:id/pay": "STAFF_ANY" })[0], /lost its role guard/);
    assert.match(compareWithBaseline(baseline, { ...baseline, "POST /api/x/:id/pay": ["ACCOUNTANT", "EMPLOYEE", "SUPER_ADMIN"] })[0], /expanded by EMPLOYEE/);
    assert.match(compareWithBaseline(baseline, { ...baseline, "GET /api/x": "PUBLIC" })[0], /guard changed from STAFF_ANY to PUBLIC/);
    assert.match(compareWithBaseline(baseline, { ...baseline, "DELETE /api/x/:id": ["SUPER_ADMIN"] })[0], /new route not in the baseline/);
  });

  test("every mounted route matches the baseline exactly", async () => {
    const actual = await routeGuards();
    assert.ok(Object.keys(actual).length > 200, `route discovery looks broken (${Object.keys(actual).length})`);
    assert.deepEqual(compareWithBaseline(BASELINE, actual), []);
  });

  test("over HTTP, each role is refused exactly where the baseline does not list it", async () => {
    const clients = {};
    for (const role of ROLES) clients[role] = staffClient(await createStaffUser({ role }));

    const wrong = [];
    for (const [route, guard] of Object.entries(BASELINE)) {
      const [method, path] = route.split(" ");
      const url = path.replace(/:\w+/g, "x");
      // Staging-only routes answer 404 before any role check unless the
      // request proves the staging key; their role guard is exercised with a
      // valid proof in umrahActivationScript.test.js.
      if (route.startsWith("POST /api/admin/staging/")) continue;
      if (Array.isArray(guard)) {
        for (const role of ROLES) {
          const allowed = guard.includes(role);
          if (allowed && method !== "GET") continue; // never fire real writes as an allowed role
          const res = await clients[role][method.toLowerCase()](url).send({});
          if (!allowed && res.status !== 403) wrong.push(`${role} ${route} -> ${res.status} (should be 403)`);
          if (allowed && res.status === 403) wrong.push(`${role} ${route} -> 403 (baseline allows it)`);
        }
      } else if (guard === "CUSTOMER" || guard === "TRACKING") {
        // a staff session is not a customer or tracking session
        const res = await clients.SUPER_ADMIN[method.toLowerCase()](url).send({});
        if (res.status !== 401 && res.status !== 403) wrong.push(`staff session ${route} -> ${res.status} (should be refused)`);
      }
    }
    assert.deepEqual(wrong, []);
  });

  test("money, execution and system actions stay with the right roles", () => {
    const allows = (route, role) => Array.isArray(BASELINE[route]) && BASELINE[route].includes(role);
    for (const route of [
      "POST /api/contact-requests/:id/confirm-payment",
      "POST /api/contact-requests/:id/reject-payment",
      "POST /api/payment-accounts",
      "PATCH /api/payment-accounts/:id",
      "PATCH /api/flights/admin/rates",
      "POST /api/settings",
      "POST /api/users",
      "PATCH /api/users/:id/role",
    ]) {
      assert.ok(Array.isArray(BASELINE[route]), `${route} must be role-guarded`);
      assert.ok(!allows(route, "EMPLOYEE"), `EMPLOYEE must not ${route}`);
      assert.ok(!allows(route, "CONTENT_MANAGER"), `CONTENT_MANAGER must not ${route}`);
    }
    for (const route of [
      "POST /api/contact-requests/:id/invoice",
      "PATCH /api/contact-requests/:id/status",
      "POST /api/contact-requests/:id/start-execution",
      "POST /api/contact-requests/:id/deliverables",
      "PATCH /api/contact-requests/:id/documents/:documentId/status",
    ]) {
      assert.ok(!allows(route, "ACCOUNTANT"), `ACCOUNTANT must not ${route}`);
      assert.ok(!allows(route, "CONTENT_MANAGER"), `CONTENT_MANAGER must not ${route}`);
      assert.ok(allows(route, "EMPLOYEE"), `EMPLOYEE works cases: ${route}`);
    }
    assert.deepEqual(BASELINE["PATCH /api/users/:id/role"], ["SUPER_ADMIN"]);
  });
});
