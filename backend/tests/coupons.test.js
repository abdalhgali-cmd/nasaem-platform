import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, registerCustomer, uniqueSuffix } from "./helpers/api.js";

async function createTestService(agent) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-CPN-${suffix}`,
    name: `Coupon Test Service ${suffix}`,
    category: "qa-coupon-test",
    basePrice: 100,
    currency: "SAR",
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createCoupon(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/coupons").send({
    code: `TEST-${suffix}`,
    discountType: "PERCENTAGE",
    discountValue: 10,
    ...overrides,
  });
  return res;
}

describe("coupon system", () => {
  let adminAgent;
  // A single shared customer session for every /validate test below: none
  // of them record a usage (validate is preview-only — see
  // coupons.controller.js), so reusing one registered customer across all
  // of them is safe and keeps this file's register() calls comfortably
  // under customer-auth's rate limiter (10 per 15 min; each test file
  // runs in its own isolated process/store).
  let customerAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
    const { agent } = await registerCustomer();
    customerAgent = agent;
  });

  test("only staff (SUPER_ADMIN/ADMIN) can manage coupons", async () => {
    const anon = await request(app).get("/api/coupons");
    assert.equal(anon.status, 401);

    const customerRes = await customerAgent.get("/api/coupons");
    assert.equal(customerRes.status, 401);

    const employeeSuffix = uniqueSuffix();
    const employeeEmail = `employee${employeeSuffix}@nasaem-platform.local`;
    const createEmployeeRes = await adminAgent.post("/api/users").send({
      fullName: "Test Employee",
      email: employeeEmail,
      phone: `249${employeeSuffix}`,
      password: "Employee@123",
      role: "EMPLOYEE",
    });
    assert.equal(createEmployeeRes.status, 201);
    const employeeAgent = request.agent(app);
    const loginRes = await employeeAgent.post("/api/auth/login").send({ email: employeeEmail, password: "Employee@123" });
    assert.equal(loginRes.status, 200);

    const employeeCouponRes = await employeeAgent.post("/api/coupons").send({ code: `X-${employeeSuffix}`, discountType: "FIXED", discountValue: 5 });
    assert.equal(employeeCouponRes.status, 403);
  });

  test("rejects a percentage discount above 100%", async () => {
    const res = await createCoupon(adminAgent, { discountType: "PERCENTAGE", discountValue: 150 });
    assert.equal(res.status, 400);
  });

  test("rejects a duplicate coupon code", async () => {
    const suffix = uniqueSuffix();
    const code = `DUP-${suffix}`;
    const first = await adminAgent.post("/api/coupons").send({ code, discountType: "FIXED", discountValue: 20 });
    assert.equal(first.status, 201);

    const second = await adminAgent.post("/api/coupons").send({ code, discountType: "FIXED", discountValue: 20 });
    assert.equal(second.status, 409);
  });

  test("admin can create, activate, deactivate and archive a coupon", async () => {
    const created = await createCoupon(adminAgent);
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const deactivated = await adminAgent.patch(`/api/coupons/${id}/deactivate`);
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.data.active, false);

    const activated = await adminAgent.patch(`/api/coupons/${id}/activate`);
    assert.equal(activated.status, 200);
    assert.equal(activated.body.data.active, true);

    const archived = await adminAgent.patch(`/api/coupons/${id}/archive`);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.archived, true);
  });

  test("validate: unknown code returns 'coupon not found'", async () => {
    const res = await customerAgent.post("/api/coupons/validate").send({ code: "DOES-NOT-EXIST", orderAmount: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /غير موجود/);
  });

  test("validate: inactive coupon is rejected", async () => {
    const created = await createCoupon(adminAgent, { active: false });
    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /غير فعال/);
  });

  test("validate: expired coupon is rejected", async () => {
    const created = await createCoupon(adminAgent, { expiryDate: "2000-01-01T00:00:00.000Z" });
    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /منتهي/);
  });

  test("validate: a coupon that hasn't started yet is rejected", async () => {
    const created = await createCoupon(adminAgent, { startDate: "2999-01-01T00:00:00.000Z" });
    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 100 });
    assert.equal(res.status, 400);
  });

  test("validate: minimum order amount not met", async () => {
    const created = await createCoupon(adminAgent, { minOrderAmount: 500 });
    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /الحد الأدنى/);
  });

  test("validate: service restriction rejects an ineligible service", async () => {
    const service = await createTestService(adminAgent);
    const otherService = await createTestService(adminAgent);
    const created = await createCoupon(adminAgent, { serviceId: service.id });

    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, serviceId: otherService.id, orderAmount: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /غير متاح لهذه الخدمة/);

    const eligible = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, serviceId: service.id, orderAmount: 100 });
    assert.equal(eligible.status, 200);
  });

  test("validate: a coupon restricted to another customer is reported as not found", async () => {
    const { customer: otherCustomer } = await registerCustomer();
    const created = await createCoupon(adminAgent, { customerId: otherCustomer.id });

    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /غير موجود/);
  });

  test("validate: computes a percentage discount correctly", async () => {
    const created = await createCoupon(adminAgent, { discountType: "PERCENTAGE", discountValue: 25 });
    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 200 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.discountAmount, 50);
    assert.equal(res.body.data.finalAmount, 150);
  });

  test("validate: a fixed discount never pushes the total below zero", async () => {
    const created = await createCoupon(adminAgent, { discountType: "FIXED", discountValue: 1000 });
    const res = await customerAgent.post("/api/coupons/validate").send({ code: created.body.data.code, orderAmount: 100 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.discountAmount, 100);
    assert.equal(res.body.data.finalAmount, 0);
  });
});
