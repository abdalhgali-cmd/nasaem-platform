import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { newApplicationRefusal } from "../src/modules/service-scope/intake-scope.js";

const db = (service, visa = null) => ({ service: { findUnique: async () => service }, visaType: { findUnique: async () => visa } });
test("ALL intake still refuses disabled and nonexistent catalog selections", async () => {
  for (const env of [{}, { PUBLIC_INTAKE_SCOPE: "ALL" }]) {
    assert.equal((await newApplicationRefusal({ serviceId: "off" }, { db: db({ code: "SVC-FLIGHT", category: "flight", active: false }), env })).error, "SERVICE_NOT_OFFERED");
    assert.equal((await newApplicationRefusal({ visaTypeId: "off" }, { db: db(null, { code: "VISA-WORK", category: "OTHER", active: false }), env })).error, "SERVICE_NOT_OFFERED");
    assert.equal((await newApplicationRefusal({ serviceId: "missing" }, { db: db(null), env })).error, "SERVICE_NOT_OFFERED");
  }
});
test("active published services use the approved default while explicit rollout restrictions remain effective", async () => {
  const options = { db: db({ code: "SVC-FLIGHT", category: "flight", active: true }), env: {} };
  assert.equal(await newApplicationRefusal({ serviceId: "flight" }, options), null);
  assert.equal((await newApplicationRefusal({ serviceId: "flight" }, { ...options, env: { PUBLIC_INTAKE_SCOPE: "UMRAH,EGYPT_CLEARANCE" } })).error, "SERVICE_NOT_OFFERED");
  assert.equal(await newApplicationRefusal({}, { db: db(null), env: {} }), null, "general inquiries remain available");
});
