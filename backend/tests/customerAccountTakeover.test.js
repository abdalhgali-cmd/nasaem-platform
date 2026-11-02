import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";

// A staff-created CRM record (orders, passport, payments) must never be
// handed to whoever registers first with its phone number.
describe("customer registration cannot take over a CRM record", () => {
  test("registering with a CRM phone creates a separate account and exposes none of the CRM history", async () => {
    const suffix = uniqueSuffix();
    const phone = `249${suffix}`;
    const crm = await prisma.customer.create({
      data: { customerNo: `CRM-${suffix}`, fullName: "Existing CRM Customer", phone, passportNo: `P${suffix}` },
    });
    const crmOrder = await prisma.order.create({
      data: { orderNumber: `CRM-ORD-${suffix}`, customerId: crm.id, totalAmount: 500, currency: "SAR" },
    });

    const agent = request.agent(app);
    const res = await agent.post("/api/customer-auth/register").send({ fullName: "Impostor", phone, password: "Test@12345" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.notEqual(res.body.data.customer.id, crm.id, "must not adopt the CRM row");
    assert.equal(res.body.data.customer.passportNo, null, "must not inherit the CRM passport");

    const stillCrm = await prisma.customer.findUnique({ where: { id: crm.id } });
    assert.equal(stillCrm.passwordHash, null, "the CRM row must stay without an account");
    assert.equal(stillCrm.sessionVersion, 0);

    const orders = await agent.get("/api/customer/orders?limit=100");
    assert.equal(orders.status, 200);
    assert.equal(orders.body.data.some((order) => order.id === crmOrder.id), false);
    const direct = await agent.get(`/api/customer/orders/${crmOrder.id}`);
    assert.equal(direct.status, 404);
  });

  test("a CRM row with the same phone does not block password reset for the real account", async () => {
    const suffix = uniqueSuffix();
    const phone = `249${suffix}`;
    await prisma.customer.create({ data: { customerNo: `CRM2-${suffix}`, fullName: "Old CRM", phone } });
    const reg = await request(app).post("/api/customer-auth/register").send({ fullName: "Real Owner", phone, password: "Test@12345" });
    assert.equal(reg.status, 201);

    const forgot = await request(app).post("/api/customer-auth/forgot-password").send({ phone });
    assert.equal(forgot.status, 200, JSON.stringify(forgot.body));
    assert.ok(forgot.body.debugCode, "reset code must be issued for the account row");

    const reset = await request(app)
      .post("/api/customer-auth/reset-password")
      .send({ phone, code: forgot.body.debugCode, newPassword: "NewPass@12345" });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    const login = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "NewPass@12345" });
    assert.equal(login.status, 200);
  });

  test("unauthenticated, forged and cross-type tokens are refused", async () => {
    assert.equal((await request(app).get("/api/customer-auth/me")).status, 401);
    assert.equal((await request(app).get("/api/customer-auth/me").set("Authorization", "Bearer not.a.jwt")).status, 401);
    assert.equal((await request(app).get("/api/customer/orders")).status, 401);
    assert.equal((await request(app).get("/api/orders")).status, 401);
  });
});
