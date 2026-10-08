import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { app, request, uniqueSuffix } from "./helpers/api.js";

// The Android app authenticates with a Bearer header instead of the
// browser cookie (see customer-auth.middleware.js's extractCustomerToken).
// These tests exercise that path on its own, without the supertest
// cookie jar, to make sure it is a complete substitute — not a weaker
// fallback — for the cookie-based session.
describe("customer Bearer token auth (mobile app persistent session)", () => {
  test("register and login return a token usable as a Bearer header", async () => {
    const suffix = uniqueSuffix();
    const phone = `2497${suffix}`;

    const registerRes = await request(app).post("/api/customer-auth/register").send({
      fullName: `Bearer Customer ${suffix}`,
      phone,
      password: "Test@12345",
    });
    assert.equal(registerRes.status, 201, JSON.stringify(registerRes.body));
    const { token, customer } = registerRes.body.data;
    assert.ok(typeof token === "string" && token.length > 10);

    const meRes = await request(app).get("/api/customer-auth/me").set("Authorization", `Bearer ${token}`);
    assert.equal(meRes.status, 200, JSON.stringify(meRes.body));
    assert.equal(meRes.body.data.id, customer.id);

    const loginRes = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "Test@12345" });
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.body));
    assert.ok(typeof loginRes.body.data.token === "string" && loginRes.body.data.token.length > 10);
  });

  test("requests/orders scoped the same way under Bearer auth as under cookie auth", async () => {
    const suffixA = uniqueSuffix();
    const registerA = await request(app).post("/api/customer-auth/register").send({
      fullName: `Bearer Isolation A ${suffixA}`,
      phone: `2498${suffixA}`,
      password: "Test@12345",
    });
    const tokenA = registerA.body.data.token;

    const orderRes = await request(app).post("/api/customer/orders").set("Authorization", `Bearer ${tokenA}`).send({});
    // No serviceId supplied → expect a validation error, not an auth error;
    // the point here is that the Bearer header alone was enough to reach
    // the authenticated route at all.
    assert.notEqual(orderRes.status, 401);

    const suffixB = uniqueSuffix();
    const registerB = await request(app).post("/api/customer-auth/register").send({
      fullName: `Bearer Isolation B ${suffixB}`,
      phone: `2499${suffixB}`,
      password: "Test@12345",
    });
    const tokenB = registerB.body.data.token;

    const ordersForB = await request(app).get("/api/customer/orders").set("Authorization", `Bearer ${tokenB}`);
    assert.equal(ordersForB.status, 200);
    assert.ok(Array.isArray(ordersForB.body.data));
    const customerAId = registerA.body.data.customer.id;
    assert.ok(!ordersForB.body.data.some((order) => order.customerId === customerAId));
  });

  test("a missing, malformed or garbage Bearer token is rejected exactly like a missing cookie", async () => {
    const noAuth = await request(app).get("/api/customer-auth/me");
    assert.equal(noAuth.status, 401);

    const garbage = await request(app).get("/api/customer-auth/me").set("Authorization", "Bearer not-a-real-token");
    assert.equal(garbage.status, 401);

    const malformedHeader = await request(app).get("/api/customer-auth/me").set("Authorization", "not-even-bearer-scheme");
    assert.equal(malformedHeader.status, 401);
  });
});

// The /track phone-OTP session (contact-request-tracking) is a separate
// auth scheme from the customer account above — used for payment/invoice
// actions on a request — but needs the exact same Bearer-header fallback
// for the mobile app, added to tracking-auth.middleware.js alongside the
// customer-auth change.
describe("tracking Bearer token auth (mobile app payment/invoice actions)", () => {
  test("verify-code returns a token usable as a Bearer header for /api/tracking routes", async () => {
    const suffix = uniqueSuffix();
    const phone = `2496${suffix}`;

    const requestRes = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(requestRes.status, 200, JSON.stringify(requestRes.body));
    const code = requestRes.body.debugCode;
    assert.ok(code, "expected debugCode in NODE_ENV=test");

    const verifyRes = await request(app).post("/api/tracking/verify-code").send({ phone, code });
    assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
    const token = verifyRes.body.data?.token;
    assert.ok(typeof token === "string" && token.length > 10);

    const requestsRes = await request(app).get("/api/tracking/requests").set("Authorization", `Bearer ${token}`);
    assert.equal(requestsRes.status, 200, JSON.stringify(requestsRes.body));
    assert.ok(Array.isArray(requestsRes.body.data));
  });
});
