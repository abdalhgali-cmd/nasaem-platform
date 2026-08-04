import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";

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
