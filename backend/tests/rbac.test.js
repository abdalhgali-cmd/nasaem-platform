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
