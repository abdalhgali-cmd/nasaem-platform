import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("role-based access control", () => {
  let superAdminAgent;
  let employeeAgent;
  const employeePassword = "TestPass@12345";

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
    const employeeEmail = `rbac-employee-${uniqueSuffix()}@nasaem-platform.local`;

    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "RBAC Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);

    employeeAgent = request.agent(app);
    const loginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email: employeeEmail, password: employeePassword });
    assert.equal(loginRes.status, 200);
  });

  test("EMPLOYEE cannot list payments", async () => {
    const res = await employeeAgent.get("/api/payments");
    assert.equal(res.status, 403);
  });

  test("EMPLOYEE cannot create a branch", async () => {
    const res = await employeeAgent.post("/api/branches").send({ code: "X" + uniqueSuffix(), name: "X" });
    assert.equal(res.status, 403);
  });

  test("EMPLOYEE cannot create another user account", async () => {
    const res = await employeeAgent.post("/api/users").send({
      fullName: "Should Not Be Created",
      email: `blocked-${uniqueSuffix()}@nasaem-platform.local`,
      password: "TestPass@12345",
    });
    assert.equal(res.status, 403);
  });

  test("SUPER_ADMIN can list payments", async () => {
    const res = await superAdminAgent.get("/api/payments");
    assert.equal(res.status, 200);
  });
});

// Platform 3.0 Phase 15: a new role, scoped to public-facing content
// configuration (homepage/theme/service+visa/airline/airport/ferry
// directories) and nothing else. These tests are the actual evidence for
// the plan's "Content Manager should not automatically gain financial or
// operational permissions" requirement — not just a claim in the docs.
describe("CONTENT_MANAGER role", () => {
  let superAdminAgent;
  let contentManagerAgent;
  const contentManagerPassword = "TestPass@12345";

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
    const email = `rbac-content-manager-${uniqueSuffix()}@nasaem-platform.local`;

    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "RBAC Test Content Manager",
      email,
      password: contentManagerPassword,
      role: "CONTENT_MANAGER",
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

    contentManagerAgent = request.agent(app);
    const loginRes = await contentManagerAgent
      .post("/api/auth/login")
      .send({ email, password: contentManagerPassword });
    assert.equal(loginRes.status, 200);
  });

  test("can read and update the homepage hero", async () => {
    const getRes = await contentManagerAgent.get("/api/homepage/hero");
    assert.equal(getRes.status, 200);

    const patchRes = await contentManagerAgent.patch("/api/homepage/hero").send({});
    assert.equal(patchRes.status, 200);
  });

  test("can read and update theme colors", async () => {
    const getRes = await contentManagerAgent.get("/api/theme");
    assert.equal(getRes.status, 200);

    const patchRes = await contentManagerAgent.patch("/api/theme").send({});
    assert.equal(patchRes.status, 200);
  });

  test("can create an airline", async () => {
    const res = await contentManagerAgent.post("/api/airlines").send({ name: `RBAC Test Airline ${uniqueSuffix()}` });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  test("can list visa types", async () => {
    const res = await contentManagerAgent.get("/api/visa-types");
    assert.equal(res.status, 200);
  });

  test("cannot list payments (financial)", async () => {
    const res = await contentManagerAgent.get("/api/payments");
    assert.equal(res.status, 403);
  });

  test("cannot confirm a contact request's payment (financial)", async () => {
    const res = await contentManagerAgent.post(`/api/contact-requests/${uniqueSuffix()}/confirm-payment`).send({});
    assert.equal(res.status, 403);
  });

  test("cannot list orders (operational)", async () => {
    const res = await contentManagerAgent.get("/api/orders");
    assert.equal(res.status, 403);
  });

  test("cannot list customers (operational)", async () => {
    const res = await contentManagerAgent.get("/api/customers");
    assert.equal(res.status, 403);
  });

  test("cannot create a branch (operational)", async () => {
    const res = await contentManagerAgent.post("/api/branches").send({ code: "X" + uniqueSuffix(), name: "X" });
    assert.equal(res.status, 403);
  });

  test("cannot toggle a feature flag (system)", async () => {
    const res = await contentManagerAgent.patch("/api/feature-flags/WHATSAPP").send({ enabled: false });
    assert.equal(res.status, 403);
  });

  test("cannot delete a service — stays SUPER_ADMIN-only even for content routes", async () => {
    const res = await contentManagerAgent.delete(`/api/services/${uniqueSuffix()}`);
    assert.equal(res.status, 403);
  });

  test("cannot create another user account", async () => {
    const res = await contentManagerAgent.post("/api/users").send({
      fullName: "Should Not Be Created",
      email: `blocked-${uniqueSuffix()}@nasaem-platform.local`,
      password: "TestPass@12345",
    });
    assert.equal(res.status, 403);
  });
});


describe("staff role administration", () => {
  let superAdminAgent;
  let employeeAgent;
  let targetUserId;
  const employeePassword = "TestPass@12345";

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
    const targetEmail = `role-target-${uniqueSuffix()}@nasaem-platform.local`;
    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "Role Target Employee",
      email: targetEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    targetUserId = createRes.body.data.id;

    employeeAgent = request.agent(app);
    const loginRes = await employeeAgent.post("/api/auth/login").send({ email: targetEmail, password: employeePassword });
    assert.equal(loginRes.status, 200);
  });

  test("SUPER_ADMIN can change a staff role", async () => {
    const res = await superAdminAgent.patch(`/api/users/${targetUserId}/role`).send({ role: "ACCOUNTANT" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.role, "ACCOUNTANT");
    assert.equal(res.body.data.passwordHash, undefined);
  });

  test("non-SUPER_ADMIN cannot change a staff role", async () => {
    const res = await employeeAgent.patch(`/api/users/${targetUserId}/role`).send({ role: "ADMIN" });
    assert.equal(res.status, 403);
  });
});
