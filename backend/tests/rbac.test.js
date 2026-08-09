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

  test("EMPLOYEE cannot reset another user's password", async () => {
    const targetEmail = `rbac-reset-target-${uniqueSuffix()}@nasaem-platform.local`;
    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "Reset Target",
      email: targetEmail,
      password: "OriginalPass@123",
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);
    const targetId = createRes.body.data.id;

    const res = await employeeAgent.patch(`/api/users/${targetId}/password`).send({ password: "NewPass@12345" });
    assert.equal(res.status, 403);
  });

  test("SUPER_ADMIN can reset another user's password, and the user can log in with it", async () => {
    const targetEmail = `rbac-reset-success-${uniqueSuffix()}@nasaem-platform.local`;
    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "Reset Success Target",
      email: targetEmail,
      password: "OriginalPass@123",
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);
    const targetId = createRes.body.data.id;

    const resetRes = await superAdminAgent
      .patch(`/api/users/${targetId}/password`)
      .send({ password: "BrandNewPass@999" });
    assert.equal(resetRes.status, 200);

    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: targetEmail, password: "OriginalPass@123" });
    assert.equal(oldLoginRes.status, 401);

    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: targetEmail, password: "BrandNewPass@999" });
    assert.equal(newLoginRes.status, 200);
  });

  test("rejects a password reset shorter than 8 characters", async () => {
    const targetEmail = `rbac-reset-tooshort-${uniqueSuffix()}@nasaem-platform.local`;
    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "Reset Too Short Target",
      email: targetEmail,
      password: "OriginalPass@123",
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);

    const res = await superAdminAgent
      .patch(`/api/users/${createRes.body.data.id}/password`)
      .send({ password: "short" });
    assert.equal(res.status, 400);
  });
});
