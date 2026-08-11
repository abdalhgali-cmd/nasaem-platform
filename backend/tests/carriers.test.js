import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Own process (own state), independent of publicContactLimiter entirely —
// this file never calls POST /contact-requests, only authenticated staff
// endpoints, which carry no rate limit in this codebase.
describe("carriers (admin-managed airline/ferry-operator catalog)", () => {
  let adminAgent;
  let employeeAgent;
  let accountantAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    const employeePassword = "TestPass@12345";
    const employeeEmail = `carriers-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const employeeRes = await adminAgent.post("/api/users").send({
      fullName: "Carriers Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(employeeRes.status, 201);
    employeeAgent = request.agent(app);
    const employeeLoginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email: employeeEmail, password: employeePassword });
    assert.equal(employeeLoginRes.status, 200);

    const accountantPassword = "TestPass@12345";
    const accountantEmail = `carriers-accountant-${uniqueSuffix()}@nasaem-platform.local`;
    const accountantRes = await adminAgent.post("/api/users").send({
      fullName: "Carriers Test Accountant",
      email: accountantEmail,
      password: accountantPassword,
      role: "ACCOUNTANT",
    });
    assert.equal(accountantRes.status, 201);
    accountantAgent = request.agent(app);
    const accountantLoginRes = await accountantAgent
      .post("/api/auth/login")
      .send({ email: accountantEmail, password: accountantPassword });
    assert.equal(accountantLoginRes.status, 200);
  });

  test("SUPER_ADMIN can create AIR and SEA carriers", async () => {
    const suffix = uniqueSuffix();

    const airRes = await adminAgent.post("/api/carriers").send({ name: `Air Carrier ${suffix}`, mode: "AIR" });
    assert.equal(airRes.status, 201);
    assert.equal(airRes.body.data.mode, "AIR");

    const seaRes = await adminAgent.post("/api/carriers").send({ name: `Sea Carrier ${suffix}`, mode: "SEA" });
    assert.equal(seaRes.status, 201);
    assert.equal(seaRes.body.data.mode, "SEA");

    const listRes = await adminAgent.get(`/api/carriers?mode=AIR`);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((c) => c.id === airRes.body.data.id));
    assert.ok(!listRes.body.data.some((c) => c.id === seaRes.body.data.id));
  });

  test("duplicate {name, mode} is rejected with 409", async () => {
    const suffix = uniqueSuffix();
    const name = `Duplicate Carrier ${suffix}`;

    const firstRes = await adminAgent.post("/api/carriers").send({ name, mode: "AIR" });
    assert.equal(firstRes.status, 201);

    const duplicateRes = await adminAgent.post("/api/carriers").send({ name, mode: "AIR" });
    assert.equal(duplicateRes.status, 409);

    // Same name, different mode is a different carrier — not a conflict.
    const differentModeRes = await adminAgent.post("/api/carriers").send({ name, mode: "SEA" });
    assert.equal(differentModeRes.status, 201);
  });

  test("PATCH toggles active, reflected in the ?active=true filter", async () => {
    const suffix = uniqueSuffix();
    const createRes = await adminAgent.post("/api/carriers").send({ name: `Togglable Carrier ${suffix}`, mode: "AIR" });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const beforeRes = await adminAgent.get(`/api/carriers?active=true`);
    assert.ok(beforeRes.body.data.some((c) => c.id === id));

    const patchRes = await adminAgent.patch(`/api/carriers/${id}`).send({ active: false });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.active, false);

    const afterRes = await adminAgent.get(`/api/carriers?active=true`);
    assert.ok(!afterRes.body.data.some((c) => c.id === id));
  });

  test("EMPLOYEE cannot create a carrier, but ACCOUNTANT can read the list", async () => {
    const forbiddenRes = await employeeAgent.post("/api/carriers").send({ name: `Nope ${uniqueSuffix()}`, mode: "AIR" });
    assert.equal(forbiddenRes.status, 403);

    const readRes = await accountantAgent.get("/api/carriers");
    assert.equal(readRes.status, 200);
  });

  test("unauthenticated requests are rejected", async () => {
    const res = await request(app).get("/api/carriers");
    assert.equal(res.status, 401);
  });
});
