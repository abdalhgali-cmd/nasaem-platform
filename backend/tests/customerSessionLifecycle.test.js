import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import prisma from "../src/config/database.js";
import { hashPassword } from "../src/utils/password.js";
import { signCustomerToken } from "../src/utils/jwt.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";

// Persistent mobile sessions: the Android app keeps a customer token for
// weeks and must be able to tell "this session is over" (401 + code) from
// "the server could not check it" (503), because only the former may log the
// customer out. These tests pin that contract and the server-side revocation
// paths (logout, password change, password reset) it relies on.

// register/login share a 10-per-15-minutes limiter, so most accounts here
// are created directly and given tokens exactly the way login issues them;
// the HTTP register/login paths are exercised where the test is about them.
let seq = 0;
async function registerWithToken() {
  const suffix = `${uniqueSuffix()}${(seq += 1)}`;
  const phone = `2496${suffix}`;
  const customer = await prisma.customer.create({
    data: {
      customerNo: `SESS-${suffix}`,
      fullName: `Session Customer ${suffix}`,
      phone,
      passwordHash: await hashPassword("Test@12345"),
    },
  });
  return { phone, token: signCustomerToken(customer.id, customer.sessionVersion), customer };
}

async function loginToken(phone, password = "Test@12345") {
  const res = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.token;
}

async function anotherDeviceToken(customer) {
  const { sessionVersion } = await prisma.customer.findUnique({ where: { id: customer.id } });
  return signCustomerToken(customer.id, sessionVersion);
}

const me = (token) => request(app).get("/api/customer-auth/me").set("Authorization", `Bearer ${token}`);

describe("customer session lifecycle (mobile persistent auth)", () => {
  test("a valid token stays valid across requests (no re-login needed)", async () => {
    const { token, customer } = await registerWithToken();
    for (let i = 0; i < 3; i += 1) {
      const res = await me(token);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.id, customer.id);
    }
  });

  test("every issued token carries a unique jti", async () => {
    const { phone, token } = await registerWithToken();
    const second = await loginToken(phone);
    const a = jwt.decode(token);
    const b = jwt.decode(second);
    assert.ok(a.jti && b.jti);
    assert.notEqual(a.jti, b.jti);
  });

  test("a database failure during the session check is a 503, never a 401", async () => {
    const { token } = await registerWithToken();
    const original = prisma.customer.findUnique;
    prisma.customer.findUnique = async () => {
      throw new Error("simulated: Can't reach database server");
    };
    try {
      const res = await me(token);
      assert.equal(res.status, 503, JSON.stringify(res.body));
      assert.equal(res.body.code, "SESSION_CHECK_UNAVAILABLE");
    } finally {
      prisma.customer.findUnique = original;
    }
    // ...and the same token still works once the database is back.
    assert.equal((await me(token)).status, 200);
  });

  test("401s carry a machine-readable reason", async () => {
    const none = await request(app).get("/api/customer-auth/me");
    assert.equal(none.status, 401);
    assert.equal(none.body.code, "AUTH_REQUIRED");

    const garbage = await me("not-a-real-token");
    assert.equal(garbage.status, 401);
    assert.equal(garbage.body.code, "SESSION_INVALID");

    const { customer } = await registerWithToken();
    const expired = jwt.sign(
      { sub: customer.id, scope: "customer", jti: `x${uniqueSuffix()}`, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET
    );
    const expiredRes = await me(expired);
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.code, "SESSION_EXPIRED");

    const wrongScope = jwt.sign({ sub: customer.id, scope: "tracking" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    assert.equal((await me(wrongScope)).body.code, "SESSION_INVALID");
  });

  test("logout revokes that token on the server but not the customer's other sessions", async () => {
    const { token: phoneToken, customer } = await registerWithToken();
    const webToken = await anotherDeviceToken(customer);

    const out = await request(app).post("/api/customer-auth/logout").set("Authorization", `Bearer ${phoneToken}`);
    assert.equal(out.status, 200);

    const after = await me(phoneToken);
    assert.equal(after.status, 401);
    assert.equal(after.body.code, "SESSION_REVOKED");
    assert.equal((await me(webToken)).status, 200, "another device's session must survive");
  });

  test("password change ends other sessions and hands this device a fresh working token", async () => {
    const { token, customer } = await registerWithToken();
    const otherDevice = await anotherDeviceToken(customer);

    const res = await request(app)
      .post("/api/customer-auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "Test@12345", newPassword: "Changed@12345" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fresh = res.body.data.token;
    assert.ok(fresh);

    assert.equal((await me(otherDevice)).body.code, "SESSION_REVOKED");
    assert.equal((await me(token)).body.code, "SESSION_REVOKED");
    assert.equal((await me(fresh)).status, 200);
    // The web cookie is refreshed in the same response, so the web stays signed in.
    assert.match(String(res.headers["set-cookie"]), /customerAccessToken=/);
  });

  test("password reset ends every existing session", async () => {
    const { phone, token } = await registerWithToken();
    const forgot = await request(app).post("/api/customer-auth/forgot-password").send({ phone });
    assert.equal(forgot.status, 200);
    const reset = await request(app)
      .post("/api/customer-auth/reset-password")
      .send({ phone, code: forgot.body.debugCode, newPassword: "Reset@12345" });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    assert.equal((await me(token)).body.code, "SESSION_REVOKED");
    assert.equal((await me(await loginToken(phone, "Reset@12345"))).status, 200);
  });

  test("a removed account ends the session, and re-registering does not revive old tokens", async () => {
    const { phone, token, customer } = await registerWithToken();
    await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash: null } });
    const res = await me(token);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "SESSION_REVOKED");

    const again = await request(app).post("/api/customer-auth/register").send({
      fullName: "Someone Else",
      phone,
      password: "Other@12345",
    });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.data.customer.id, customer.id);
    assert.equal((await me(token)).body.code, "SESSION_REVOKED");
    assert.equal((await me(again.body.data.token)).status, 200);
  });

  test("refresh renews a live session and refuses a revoked one", async () => {
    const { token } = await registerWithToken();
    const res = await request(app).post("/api/customer-auth/refresh").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const renewed = res.body.data.token;
    assert.ok(jwt.decode(renewed).exp >= jwt.decode(token).exp);
    assert.equal((await me(renewed)).status, 200);
    // the old token is deliberately left valid (a lost response must not lock the app out)
    assert.equal((await me(token)).status, 200);

    await request(app).post("/api/customer-auth/logout").set("Authorization", `Bearer ${renewed}`);
    const again = await request(app).post("/api/customer-auth/refresh").set("Authorization", `Bearer ${renewed}`);
    assert.equal(again.status, 401);
  });

  test("tokens issued before jti existed keep working until they expire", async () => {
    const { customer } = await registerWithToken();
    const legacy = jwt.sign({ sub: customer.id, scope: "customer" }, process.env.JWT_SECRET, { expiresIn: "30d" });
    assert.equal((await me(legacy)).status, 200);
  });
});
