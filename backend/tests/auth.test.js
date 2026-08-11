import "./env.js";
import { describe, test } from "node:test";
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

  test("a suspended account is rejected at login, not just on later requests", async () => {
    const adminAgent = await loginAsSuperAdmin();
    const email = `suspended-${uniqueSuffix()}@nasaem-platform.local`;
    const password = "TestPass@12345";

    const createRes = await adminAgent.post("/api/users").send({
      fullName: "Suspended Login Test",
      email,
      password,
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);

    const suspendRes = await adminAgent.patch(`/api/users/${createRes.body.data.id}/status`).send({
      status: "SUSPENDED",
    });
    assert.equal(suspendRes.status, 200);

    const loginRes = await request(app).post("/api/auth/login").send({ email, password });
    assert.equal(loginRes.status, 401);
    assert.equal(loginRes.body.message, "Account is not active");
  });

  test("logout clears the session", async () => {
    const agent = await loginAsSuperAdmin();

    const logoutRes = await agent.post("/api/auth/logout");
    assert.equal(logoutRes.status, 200);

    const meRes = await agent.get("/api/auth/me");
    assert.equal(meRes.status, 401);
  });
});
