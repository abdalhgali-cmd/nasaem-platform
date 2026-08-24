import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("auth", () => {
  test("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@nasaem-platform.local", password: "definitely-wrong" });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test("logs in with the seeded super admin and can fetch /auth/me", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.get("/api/auth/me");

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, "SUPER_ADMIN");
    assert.equal("passwordHash" in res.body.data, false);
  });

  test("protected routes reject unauthenticated requests", async () => {
    const res = await request(app).get("/api/orders");
    assert.equal(res.status, 401);
  });

  test("logout clears the session", async () => {
    const agent = await loginAsSuperAdmin();

    const logoutRes = await agent.post("/api/auth/logout");
    assert.equal(logoutRes.status, 200);

    const meRes = await agent.get("/api/auth/me");
    assert.equal(meRes.status, 401);
  });
});

describe("change password", () => {
  // Uses dedicated, throwaway users rather than the shared seeded super
  // admin — other test files log in as that account by password, so
  // mutating it here would break them. Shared across the two tests that
  // don't actually mutate the password (below) to keep this file's total
  // /auth/login call count under the login route's own rate limit; the
  // test that does mutate the password gets its own separate user.
  async function createTestUser() {
    const superAdminAgent = await loginAsSuperAdmin();
    const email = `change-pw-${uniqueSuffix()}@nasaem-platform.local`;
    const password = "OldPass@12345";

    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "Change Password Test User",
      email,
      password,
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({ email, password });
    assert.equal(loginRes.status, 200);

    return { agent, email, password };
  }

  let shared;
  before(async () => {
    shared = await createTestUser();
  });

  test("rejects an incorrect current password", async () => {
    const res = await shared.agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "definitely-wrong", newPassword: "NewPass@12345" });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("rejects a new password shorter than 8 characters", async () => {
    const res = await shared.agent
      .post("/api/auth/change-password")
      .send({ currentPassword: shared.password, newPassword: "short" });

    assert.equal(res.status, 400);
  });

  test("changes the password and the old password stops working", async () => {
    const { agent, email, password } = await createTestUser();

    const newPassword = "NewPass@12345";
    const changeRes = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: password, newPassword });

    assert.equal(changeRes.status, 200);
    assert.equal(changeRes.body.success, true);

    const oldLoginRes = await request(app).post("/api/auth/login").send({ email, password });
    assert.equal(oldLoginRes.status, 401);

    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: newPassword });
    assert.equal(newLoginRes.status, 200);
  });

  test("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "NewPass@12345" });

    assert.equal(res.status, 401);
  });
});
