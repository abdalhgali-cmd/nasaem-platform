import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// No public/rate-limited endpoints involved — every route here is an
// authenticated staff endpoint with no limiter, independent of every other
// test file's budget.
describe("user department assignment", () => {
  let adminAgent;
  let adminRoleAgent;
  let employeeAgent;
  let userId;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    const adminEmail = `user-dept-admin-${uniqueSuffix()}@nasaem-platform.local`;
    const adminPassword = "TestPass@12345";
    const adminCreateRes = await adminAgent.post("/api/users").send({
      fullName: "User Dept Test Admin",
      email: adminEmail,
      password: adminPassword,
      role: "ADMIN",
    });
    assert.equal(adminCreateRes.status, 201);
    adminRoleAgent = request.agent(app);
    const adminLoginRes = await adminRoleAgent.post("/api/auth/login").send({ email: adminEmail, password: adminPassword });
    assert.equal(adminLoginRes.status, 200);

    const employeeEmail = `user-dept-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const employeePassword = "TestPass@12345";
    const employeeCreateRes = await adminAgent.post("/api/users").send({
      fullName: "User Dept Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(employeeCreateRes.status, 201);
    employeeAgent = request.agent(app);
    const employeeLoginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email: employeeEmail, password: employeePassword });
    assert.equal(employeeLoginRes.status, 200);
  });

  test("SUPER_ADMIN can create a user with a department set", async () => {
    const res = await adminAgent.post("/api/users").send({
      fullName: "Flights Department Employee",
      email: `flights-employee-${uniqueSuffix()}@nasaem-platform.local`,
      password: "TestPass@12345",
      role: "EMPLOYEE",
      department: "FLIGHTS",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.department, "FLIGHTS");
    userId = res.body.data.id;
  });

  test("PATCH /users/:id/department as SUPER_ADMIN updates the department", async () => {
    const res = await adminAgent.patch(`/api/users/${userId}/department`).send({ department: "UMRAH" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.department, "UMRAH");
  });

  test("PATCH /users/:id/department as ADMIN is also allowed", async () => {
    const res = await adminRoleAgent.patch(`/api/users/${userId}/department`).send({ department: "VISAS" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.department, "VISAS");
  });

  test("PATCH /users/:id/department as EMPLOYEE is forbidden", async () => {
    const res = await employeeAgent.patch(`/api/users/${userId}/department`).send({ department: "FERRY" });
    assert.equal(res.status, 403);
  });

  test("department: null clears it back to unassigned", async () => {
    const res = await adminAgent.patch(`/api/users/${userId}/department`).send({ department: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.department, null);
  });

  test("an invalid department value is rejected with 400", async () => {
    const res = await adminAgent.patch(`/api/users/${userId}/department`).send({ department: "NOT_A_REAL_DEPARTMENT" });
    assert.equal(res.status, 400);
  });

  test("a nonexistent user id 404s", async () => {
    const res = await adminAgent.patch("/api/users/does-not-exist/department").send({ department: "FLIGHTS" });
    assert.equal(res.status, 404);
  });
});
