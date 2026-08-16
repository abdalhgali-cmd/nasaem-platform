import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { requestStaffPasswordReset } from "../src/modules/auth/auth.service.js";

// Own process (own fresh in-memory rate limiters), no POST /contact-requests
// calls at all — independent of every ContactRequest-related file's budget.
//
// /auth/password-reset/request is itself rate-limited to 5/15min/IP, and
// every call in this file shares that one process-wide budget (supertest
// requests all appear to originate from the same IP). To fit every required
// scenario in that budget while still explicitly proving the "6th request
// -> 429" boundary, this file spends its 5 real HTTP request-calls on:
// happy path, wrong-code, attempts-exhausted setup, expired setup, and
// unknown-email — then makes one more (6th) HTTP call whose only purpose is
// to assert 429. The "suspended user" and "phone: null" no-leak scenarios
// are exercised by importing requestStaffPasswordReset directly instead of
// through HTTP — this is testing the same business logic the route calls,
// without spending rate-limit budget the route's own boundary test needs.
// Direct-Prisma access (imported the same way contactRequestRefunds.test.js
// and reports.test.js already do) is used to force attempts-exhausted and
// expired states instead of manufacturing them through 5+ extra HTTP calls.
describe("staff self-service password reset", () => {
  let adminAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  async function createStaffUser({ phone, status } = {}) {
    const suffix = uniqueSuffix();
    const email = `staff-reset-${suffix}@nasaem-platform.local`;
    const password = "OldPass@12345";
    const createRes = await adminAgent.post("/api/users").send({
      fullName: "Staff Reset Test User",
      email,
      password,
      phone: phone === undefined ? `+96650${suffix}` : phone,
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);

    if (status) {
      const statusRes = await adminAgent.patch(`/api/users/${createRes.body.data.id}/status`).send({ status });
      assert.equal(statusRes.status, 200);
    }

    return { id: createRes.body.data.id, email, password };
  }

  test("happy path: request -> confirm with new password -> login with new password, old password rejected; the same code cannot be reused", async () => {
    const user = await createStaffUser();

    const requestRes = await request(app).post("/api/auth/password-reset/request").send({ email: user.email });
    assert.equal(requestRes.status, 200);
    assert.ok(requestRes.body.data.resetCodeId);
    assert.ok(requestRes.body.data.debugCode);

    const newPassword = "NewPass@98765";
    const confirmRes = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: requestRes.body.data.resetCodeId,
      code: requestRes.body.data.debugCode,
      password: newPassword,
    });
    assert.equal(confirmRes.status, 200);

    const newLoginRes = await request(app).post("/api/auth/login").send({ email: user.email, password: newPassword });
    assert.equal(newLoginRes.status, 200);

    const oldLoginRes = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password });
    assert.equal(oldLoginRes.status, 401);

    // Reuse of an already-consumed code fails, using the confirm limiter's
    // own budget (not the request limiter's).
    const reuseRes = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: requestRes.body.data.resetCodeId,
      code: requestRes.body.data.debugCode,
      password: "AnotherPass@11111",
    });
    assert.equal(reuseRes.status, 400);
  });

  test("wrong code returns the generic 400 message", async () => {
    const user = await createStaffUser();

    const requestRes = await request(app).post("/api/auth/password-reset/request").send({ email: user.email });
    assert.equal(requestRes.status, 200);

    const res = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: requestRes.body.data.resetCodeId,
      code: "000000",
      password: "SomePass@22222",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "الرمز غير صحيح أو منتهي الصلاحية");
  });

  test("attempts cap: once attempts reach the max, even the correct code fails", async () => {
    const user = await createStaffUser();

    const requestRes = await request(app).post("/api/auth/password-reset/request").send({ email: user.email });
    assert.equal(requestRes.status, 200);

    // Force the attempts field to the cap directly (5 real wrong-guess HTTP
    // calls would still work but would eat unnecessary confirm-limiter
    // budget for no extra coverage — this is a DB-state test, not an
    // HTTP-sequencing test).
    await prisma.staffPasswordResetCode.update({
      where: { id: requestRes.body.data.resetCodeId },
      data: { attempts: 5 },
    });

    const res = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: requestRes.body.data.resetCodeId,
      code: requestRes.body.data.debugCode,
      password: "SomePass@33333",
    });
    assert.equal(res.status, 400);
  });

  test("an expired code fails", async () => {
    const user = await createStaffUser();

    const requestRes = await request(app).post("/api/auth/password-reset/request").send({ email: user.email });
    assert.equal(requestRes.status, 200);

    await prisma.staffPasswordResetCode.update({
      where: { id: requestRes.body.data.resetCodeId },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const res = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: requestRes.body.data.resetCodeId,
      code: requestRes.body.data.debugCode,
      password: "SomePass@44444",
    });
    assert.equal(res.status, 400);
  });

  test("an unknown email gets the identical 200 shape (no debugCode) and confirming against it fails", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: `no-such-user-${uniqueSuffix()}@nasaem-platform.local` });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.resetCodeId);
    assert.equal(res.body.data.debugCode, undefined);

    const confirmRes = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: res.body.data.resetCodeId,
      code: "123456",
      password: "SomePass@55555",
    });
    assert.equal(confirmRes.status, 400);
  });

  test("a user with no phone gets the identical no-leak shape (direct service call, no HTTP budget spent)", async () => {
    const user = await createStaffUser({ phone: null });

    const result = await requestStaffPasswordReset(user.email);
    assert.ok(result.resetCodeId);
    assert.equal(result.debugCode, undefined);

    // No row was actually created — confirming against this id 404-equivalent
    // (generic 400) via the real confirm endpoint, at no request-budget cost.
    const confirmRes = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: result.resetCodeId,
      code: "123456",
      password: "SomePass@66666",
    });
    assert.equal(confirmRes.status, 400);
  });

  test("a SUSPENDED account: request gives the no-leak shape, and a valid code obtained while active stops working once suspended", async () => {
    const user = await createStaffUser();

    // Get a real code while still ACTIVE (direct service call — no HTTP
    // request-budget spent), then suspend, then prove the real confirm
    // endpoint rejects it due to the status recheck at confirm time.
    const result = await requestStaffPasswordReset(user.email);
    assert.ok(result.resetCodeId);
    assert.ok(result.debugCode);

    const statusRes = await adminAgent.patch(`/api/users/${user.id}/status`).send({ status: "SUSPENDED" });
    assert.equal(statusRes.status, 200);

    const confirmRes = await request(app).post("/api/auth/password-reset/confirm").send({
      resetCodeId: result.resetCodeId,
      code: result.debugCode,
      password: "SomePass@77777",
    });
    assert.equal(confirmRes.status, 400);

    // Also confirm a fresh request for the now-suspended account gets the
    // identical no-leak 200 shape.
    const requestAgainResult = await requestStaffPasswordReset(user.email);
    assert.ok(requestAgainResult.resetCodeId);
    assert.equal(requestAgainResult.debugCode, undefined);
  });

  test("the 6th request within the window is rate-limited (429)", async () => {
    const res = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: `rate-limit-boundary-${uniqueSuffix()}@nasaem-platform.local` });
    assert.equal(res.status, 429);
  });
});
