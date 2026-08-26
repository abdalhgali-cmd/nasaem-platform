import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, registerCustomer, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Split from customerAuthProfile.test.js so each file's register()/login()
// calls stay comfortably under customer-auth's rate limiter (10 per 15
// minutes, see customer-auth.routes.js's authLimiter) — each test file
// runs in its own isolated process/store (Node's test runner default).
describe("customer accounts: registration, login, session", () => {
  test("registers a new customer account and returns a session cookie", async () => {
    const { agent, customer } = await registerCustomer();
    assert.equal("passwordHash" in customer, false);

    const me = await agent.get("/api/customer-auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.data.id, customer.id);
  });

  test("rejects registering the same phone twice", async () => {
    const suffix = uniqueSuffix();
    const phone = `249${suffix}`;
    const first = await request(app).post("/api/customer-auth/register").send({ fullName: "Ali A", phone, password: "Test@12345" });
    assert.equal(first.status, 201);

    const second = await request(app).post("/api/customer-auth/register").send({ fullName: "Bob B", phone, password: "Different@123" });
    assert.equal(second.status, 409);
  });

  test("rejects a weak password", async () => {
    const res = await request(app).post("/api/customer-auth/register").send({ fullName: "A", phone: "249911112222", password: "123" });
    assert.equal(res.status, 400);
  });

  test("logs in with phone or email and rejects wrong password", async () => {
    const suffix = uniqueSuffix();
    const phone = `249${suffix}`;
    const email = `customer${suffix}@example.com`;
    await request(app).post("/api/customer-auth/register").send({ fullName: "Login Test", phone, email, password: "Test@12345" });

    const byPhone = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "Test@12345" });
    assert.equal(byPhone.status, 200);

    const byEmail = await request(app).post("/api/customer-auth/login").send({ identifier: email, password: "Test@12345" });
    assert.equal(byEmail.status, 200);

    const wrongPassword = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "wrong-password" });
    assert.equal(wrongPassword.status, 401);
  });

  test("logout clears the customer session", async () => {
    const { agent } = await registerCustomer();
    const logoutRes = await agent.post("/api/customer-auth/logout");
    assert.equal(logoutRes.status, 200);

    const meRes = await agent.get("/api/customer-auth/me");
    assert.equal(meRes.status, 401);
  });

  test("customer-auth /me and /customer/* require a customer session (not a staff session)", async () => {
    const staffAgent = await loginAsSuperAdmin();
    const res = await staffAgent.get("/api/customer-auth/me");
    assert.equal(res.status, 401);

    const overviewRes = await staffAgent.get("/api/customer/overview");
    assert.equal(overviewRes.status, 401);
  });
});
