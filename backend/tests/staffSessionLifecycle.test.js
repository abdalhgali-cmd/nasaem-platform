import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

function bearer(token) {
  return request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
}

async function loginAndGetToken(user) {
  const res = await request(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "XMLHttpRequest")
    .send({ email: user.email, password: user.password });
  assert.equal(res.status, 200);
  return res.body.data.token;
}

describe("staff sessions: revocation", () => {
  test("a logged-out token cannot be reused, and another device stays signed in", async () => {
    const user = await createStaffUser({ role: "EMPLOYEE" });
    const deviceA = await loginAndGetToken(user);
    const deviceB = await loginAndGetToken(user);
    assert.notEqual(deviceA, deviceB, "every login must issue a distinct token");

    const logout = await staffClient(user, { token: deviceA }).post("/api/auth/logout");
    assert.equal(logout.status, 200);

    const reuse = await bearer(deviceA);
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.code, "SESSION_REVOKED");
    assert.equal((await bearer(deviceB)).status, 200);
  });

  test("a legacy token without jti/sv keeps working until logged out", async () => {
    const user = await createStaffUser({ role: "EMPLOYEE" });
    const legacy = jwt.sign({ sub: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    assert.equal((await bearer(legacy)).status, 200);
    assert.equal((await staffClient(user, { token: legacy }).post("/api/auth/logout")).status, 200);
    assert.equal((await bearer(legacy)).status, 401);
  });

  test("suspending an account ends its sessions even after re-activation", async () => {
    const admin = await createStaffUser({ role: "SUPER_ADMIN" });
    const user = await createStaffUser({ role: "EMPLOYEE" });
    const token = await loginAndGetToken(user);

    assert.equal((await staffClient(admin).patch(`/api/users/${user.id}/status`).send({ status: "SUSPENDED" })).status, 200);
    const whileSuspended = await bearer(token);
    assert.equal(whileSuspended.status, 401);
    assert.equal(whileSuspended.body.code, "ACCOUNT_INACTIVE");
    const loginWhileSuspended = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password });
    assert.equal(loginWhileSuspended.status, 403, "a suspended account must not be issued a token");

    assert.equal((await staffClient(admin).patch(`/api/users/${user.id}/status`).send({ status: "ACTIVE" })).status, 200);
    const afterReactivation = await bearer(token);
    assert.equal(afterReactivation.status, 401);
    assert.equal(afterReactivation.body.code, "SESSION_REVOKED");
  });

  test("changing the password ends other sessions and returns a working token", async () => {
    const user = await createStaffUser({ role: "ACCOUNTANT" });
    const other = await loginAndGetToken(user);
    const current = await loginAndGetToken(user);

    const wrong = await staffClient(user, { token: current }).post("/api/auth/change-password").send({ currentPassword: "nope", newPassword: "NewPass@12345" });
    assert.equal(wrong.status, 400);

    const ok = await staffClient(user, { token: current }).post("/api/auth/change-password").send({ currentPassword: user.password, newPassword: "NewPass@12345" });
    assert.equal(ok.status, 200);
    assert.equal((await bearer(other)).status, 401);
    assert.equal((await bearer(current)).status, 401);
    assert.equal((await bearer(ok.body.data.token)).status, 200);
  });
});

describe("staff sessions: invalid session vs. unavailable check", () => {
  test("missing, forged, expired and customer-scoped tokens are 401 with a code", async () => {
    const user = await createStaffUser({ role: "EMPLOYEE" });
    const none = await request(app).get("/api/auth/me");
    assert.equal(none.status, 401);
    assert.equal(none.body.code, "AUTH_REQUIRED");

    const forged = await bearer(jwt.sign({ sub: user.id }, "not-the-secret"));
    assert.equal(forged.status, 401);
    assert.equal(forged.body.code, "SESSION_INVALID");

    const expired = await bearer(jwt.sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET));
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, "SESSION_EXPIRED");

    const scoped = await bearer(jwt.sign({ sub: user.id, scope: "tracking" }, process.env.JWT_SECRET));
    assert.equal(scoped.status, 401);
  });

  test("a database failure during the session check is 503, not an expired session", async () => {
    const user = await createStaffUser({ role: "EMPLOYEE" });
    const token = await loginAndGetToken(user);
    const original = prisma.user.findUnique;
    prisma.user.findUnique = async () => {
      const error = new Error("Can't reach database server at `localhost:5432`");
      error.name = "PrismaClientInitializationError";
      throw error;
    };
    try {
      const res = await bearer(token);
      assert.equal(res.status, 503);
      assert.equal(res.body.code, "SESSION_CHECK_UNAVAILABLE");
    } finally {
      prisma.user.findUnique = original;
    }
    assert.equal((await bearer(token)).status, 200, "the same session works again once the database is back");
  });
});
