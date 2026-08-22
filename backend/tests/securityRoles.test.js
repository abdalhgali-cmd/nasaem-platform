import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";

describe("security and role boundaries", () => {
  test("admin dashboard requires authentication", async () => {
    const res = await request(app).get("/api/dashboard/stats");
    assert.equal(res.status, 401);
  });

  test("customer collection requires authentication", async () => {
    const res = await request(app).get("/api/customers");
    assert.equal(res.status, 401);
  });

  test("super admin can access dashboard stats without exposing password hashes", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.get("/api/dashboard/stats");
    assert.equal(res.status, 200);
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes("passwordHash"), false);
  });
});
