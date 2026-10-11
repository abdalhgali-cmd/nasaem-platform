import "./env.js";
import fs from "fs";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.API_RATE_LIMIT = "100000";
process.env.API_SESSION_RATE_LIMIT = "100000";
const { createStaffUser, staffClient } = await import("./helpers/staff.js");

// Every staff route declares the roles it allows (requireRole). For every
// route and every staff role: a role NOT on the list is refused with 403, and a
// role on it is never refused with 403. The first part makes a forgotten or
// widened guard fail the build; the second catches a guard stricter than meant.
const ROLES = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"];

async function effectiveRoutes() {
  const index = fs.readFileSync(new URL("../src/routes/index.js", import.meta.url), "utf8");
  const imports = Object.fromEntries([...index.matchAll(/import (\w+) from "(\.\.\/modules\/[^"]+)"/g)].map((m) => [m[1], m[2]]));
  const mounts = [...index.matchAll(/router\.use\("([^"]+)", (\w+)\)/g)].map((m) => ({ prefix: m[1], file: imports[m[2]] }));
  const out = [];
  for (const { prefix, file } of mounts) {
    const router = (await import(new URL(`../src/routes/${file}`, import.meta.url))).default;
    let routerLevel = null; // roles set by router.use(requireRole(...)) so far
    for (const layer of router.stack) {
      if (!layer.route) {
        if (layer.handle?.allowedRoles) routerLevel = layer.handle.allowedRoles;
        continue;
      }
      const own = layer.route.stack.map((l) => l.handle?.allowedRoles).filter(Boolean);
      const roles = own.length ? own[own.length - 1] : routerLevel;
      if (!roles) continue; // public or customer/tracking-authenticated route
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method: method.toUpperCase(), path: `/api${prefix}${layer.route.path === "/" ? "" : layer.route.path}`, roles });
      }
    }
  }
  return out;
}

// Routes whose handler has an irreversible effect even on an empty body; they
// are probed only for the refused roles (403 happens before the handler).
describe("staff RBAC matrix", () => {
  test("every role-guarded route refuses exactly the roles it does not list", async () => {
    const routes = await effectiveRoutes();
    assert.ok(routes.length > 120, `route discovery looks broken (${routes.length})`);
    const clients = {};
    for (const role of ROLES) clients[role] = staffClient(await createStaffUser({ role }));

    const wrong = [];
    for (const { method, path, roles } of routes) {
      const url = path.replace(/:\w+/g, "x");
      for (const role of ROLES) {
        const allowed = roles.includes(role);
        if (allowed && method !== "GET") continue; // never fire real writes as an allowed role
        const res = await clients[role][method.toLowerCase()](url).send({});
        if (!allowed && res.status !== 403) wrong.push(`${role} ${method} ${path} -> ${res.status} (should be 403)`);
        if (allowed && res.status === 403) wrong.push(`${role} ${method} ${path} -> 403 (listed as allowed)`);
      }
    }
    assert.deepEqual(wrong, []);
  });

  test("money and system actions stay out of EMPLOYEE and CONTENT_MANAGER hands", async () => {
    const routes = await effectiveRoutes();
    const has = (method, path, role) => routes.find((r) => r.method === method && r.path === path)?.roles.includes(role);
    for (const [method, path] of [
      ["POST", "/api/contact-requests/:id/confirm-payment"],
      ["POST", "/api/contact-requests/:id/reject-payment"],
      ["POST", "/api/payment-accounts"],
      ["PATCH", "/api/payment-accounts/:id"],
      ["PATCH", "/api/flights/admin/rates"],
      ["POST", "/api/settings"],
      ["POST", "/api/users"],
      ["PATCH", "/api/users/:id/role"],
    ]) {
      assert.ok(routes.some((r) => r.method === method && r.path === path), `${method} ${path} must be role-guarded`);
      assert.ok(!has(method, path, "EMPLOYEE"), `EMPLOYEE must not ${method} ${path}`);
      assert.ok(!has(method, path, "CONTENT_MANAGER"), `CONTENT_MANAGER must not ${method} ${path}`);
    }
    assert.ok(!has("POST", "/api/contact-requests/:id/invoice", "ACCOUNTANT"), "ACCOUNTANT cannot change a request's price");
    assert.ok(!has("PATCH", "/api/contact-requests/:id/status", "ACCOUNTANT"), "ACCOUNTANT cannot change a request's status");
  });
});
