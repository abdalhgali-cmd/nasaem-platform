import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, registerCustomer, uniqueSuffix } from "./helpers/api.js";

// See customerAuth.test.js for why this is a separate file (rate-limit
// budget isolation, not a topical split).
describe("customer accounts: password management, profile, authorization", () => {
  test("a customer session cannot access staff-only routes", async () => {
    const { agent } = await registerCustomer();
    const res = await agent.get("/api/orders");
    assert.equal(res.status, 401);

    const usersRes = await agent.get("/api/users");
    assert.equal(usersRes.status, 401);
  });

  test("change-password requires the correct current password", async () => {
    const { agent } = await registerCustomer({ password: "Original@123" });

    const wrong = await agent.post("/api/customer-auth/change-password").send({ currentPassword: "not-it", newPassword: "NewPass@123" });
    assert.equal(wrong.status, 401);

    const ok = await agent.post("/api/customer-auth/change-password").send({ currentPassword: "Original@123", newPassword: "NewPass@123" });
    assert.equal(ok.status, 200);

    const loggedOut = await agent.post("/api/customer-auth/logout");
    assert.equal(loggedOut.status, 200);

    const meAfter = await agent.get("/api/customer-auth/me");
    assert.equal(meAfter.status, 401);
  });

  test("forgot-password / reset-password flow", async () => {
    const suffix = uniqueSuffix();
    const phone = `249${suffix}`;
    await request(app).post("/api/customer-auth/register").send({ fullName: "Reset Test", phone, password: "Original@123" });

    const forgot = await request(app).post("/api/customer-auth/forgot-password").send({ phone });
    assert.equal(forgot.status, 200);
    assert.ok(forgot.body.debugCode, "test env should echo the reset code for assertions");

    const badCode = await request(app).post("/api/customer-auth/reset-password").send({ phone, code: "000000", newPassword: "Newer@123" });
    assert.equal(badCode.status, 400);

    const reset = await request(app)
      .post("/api/customer-auth/reset-password")
      .send({ phone, code: forgot.body.debugCode, newPassword: "Newer@123" });
    assert.equal(reset.status, 200);

    const loginOld = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "Original@123" });
    assert.equal(loginOld.status, 401);

    const loginNew = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "Newer@123" });
    assert.equal(loginNew.status, 200);
  });

  test("forgot-password never reveals whether a phone number has an account", async () => {
    const res = await request(app).post("/api/customer-auth/forgot-password").send({ phone: "249900000000" });
    assert.equal(res.status, 200);
    assert.equal(res.body.debugCode, undefined);
  });

  test("updating profile rejects an email already claimed by another account", async () => {
    const suffixA = uniqueSuffix();
    const emailA = `taken${suffixA}@example.com`;
    await registerCustomer({ email: emailA });

    const { agent: agentB } = await registerCustomer();
    const res = await agentB.patch("/api/customer-auth/profile").send({ email: emailA });
    assert.equal(res.status, 409);
  });

  test("a customer can update their own profile", async () => {
    const { agent } = await registerCustomer();
    const res = await agent.patch("/api/customer-auth/profile").send({ fullName: "Updated Name", city: "Khartoum" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.fullName, "Updated Name");
    assert.equal(res.body.data.city, "Khartoum");
  });
});
