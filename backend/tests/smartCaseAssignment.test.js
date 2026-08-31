import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Smart Case Operations — Release C groundwork: employee assignment on
// ContactRequest (PATCH /:id/assign) and the assignedUserId=mine / =unassigned
// work-queue filters on GET /. Real submissions kept to 2, well under the
// shared 5-per-15min limiter on the public POST /api/contact-requests
// endpoint (see contactRequestDocuments.test.js's own comment).

async function createEmployee(agent, roleOverride = "EMPLOYEE") {
  const suffix = uniqueSuffix();
  const email = `assign-${roleOverride.toLowerCase()}-${suffix}@nasaem-platform.local`;
  const password = "TestPass@12345";
  const createRes = await agent.post("/api/users").send({
    fullName: `Assignment Test ${roleOverride}`,
    email,
    password,
    role: roleOverride,
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

  const employeeAgent = request.agent(app);
  const loginRes = await employeeAgent.post("/api/auth/login").send({ email, password });
  assert.equal(loginRes.status, 200);

  return { agent: employeeAgent, user: createRes.body.data };
}

describe("employee assignment on contact requests", () => {
  let superAdminAgent;
  let contactRequestId;
  let employee;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
    employee = await createEmployee(superAdminAgent);

    const phone = `081${uniqueSuffix()}`;
    const res = await request(app).post("/api/contact-requests").send({
      name: "Assignment Test Request",
      phone,
      message: "طلب اختبار تعيين الموظف",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    contactRequestId = res.body.data.id;
  });

  test("is unassigned by default", async () => {
    const listRes = await superAdminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(found.assignedUserId, null);
    assert.equal(found.assignedUser, null);
  });

  test("EMPLOYEE cannot assign (manager-only action)", async () => {
    const res = await employee.agent
      .patch(`/api/contact-requests/${contactRequestId}/assign`)
      .send({ assignedUserId: employee.user.id });
    assert.equal(res.status, 403);
  });

  test("SUPER_ADMIN can assign to an employee, and it's reflected in the list + assignedUserId=mine filter", async () => {
    const assignRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/assign`)
      .send({ assignedUserId: employee.user.id });
    assert.equal(assignRes.status, 200, JSON.stringify(assignRes.body));
    assert.equal(assignRes.body.data.assignedUserId, employee.user.id);
    assert.equal(assignRes.body.data.assignedUser.id, employee.user.id);
    // safeUserSelect projection — never a password hash.
    assert.equal(assignRes.body.data.assignedUser.passwordHash, undefined);

    const mineRes = await employee.agent.get("/api/contact-requests?assignedUserId=mine&limit=50");
    assert.equal(mineRes.status, 200);
    assert.ok(mineRes.body.data.some((r) => r.id === contactRequestId));

    const unassignedRes = await superAdminAgent.get("/api/contact-requests?assignedUserId=unassigned&limit=50");
    assert.ok(!unassignedRes.body.data.some((r) => r.id === contactRequestId));
  });

  test("assigning to a nonexistent user is rejected with 404, and reassigning to null unassigns", async () => {
    const badRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/assign`)
      .send({ assignedUserId: "does-not-exist" });
    assert.equal(badRes.status, 404);

    const unassignRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/assign`)
      .send({ assignedUserId: null });
    assert.equal(unassignRes.status, 200);
    assert.equal(unassignRes.body.data.assignedUserId, null);

    const mineAfterRes = await employee.agent.get("/api/contact-requests?assignedUserId=mine&limit=50");
    assert.ok(!mineAfterRes.body.data.some((r) => r.id === contactRequestId));
  });

  test("404s assigning a contact request that doesn't exist", async () => {
    const res = await superAdminAgent
      .patch("/api/contact-requests/does-not-exist/assign")
      .send({ assignedUserId: employee.user.id });
    assert.equal(res.status, 404);
  });
});
