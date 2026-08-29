import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, registerCustomer, uniqueSuffix } from "./helpers/api.js";

async function createTestService(agent, basePrice = 100) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-ORD-${suffix}`,
    name: `Order Coupon Test Service ${suffix}`,
    category: "qa-order-coupon-test",
    basePrice,
    currency: "SAR",
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createCoupon(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/coupons").send({
    code: `ORD-${suffix}`,
    discountType: "FIXED",
    discountValue: 20,
    ...overrides,
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

describe("order pricing with coupons (server-side only)", () => {
  let adminAgent;
  let service;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
    service = await createTestService(adminAgent, 100);
  });

  test("self-checkout never trusts a client-supplied price, and persists the coupon snapshot", async () => {
    const coupon = await createCoupon(adminAgent, { serviceId: service.id, discountValue: 30 });
    const { agent } = await registerCustomer();

    // A client-supplied unitPrice/discount (if it were ever accepted) would
    // let a customer set their own price — the self-checkout endpoint only
    // takes serviceId/quantity/couponCode, never a price, precisely to rule
    // that out. This just documents the endpoint's actual contract.
    const res = await agent.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code, unitPrice: 1 });
    assert.equal(res.status, 201);

    const order = res.body.data;
    assert.equal(Number(order.originalAmount), 100);
    assert.equal(Number(order.discountAmount), 30);
    assert.equal(Number(order.totalAmount), 70);
    assert.equal(order.couponCode, coupon.code);
    assert.equal(order.discountType, "FIXED");
  });

  test("enforces usageLimitPerCustomer (default 1) — the same customer can't reuse a coupon", async () => {
    const coupon = await createCoupon(adminAgent, { serviceId: service.id });
    const { agent } = await registerCustomer();

    const first = await agent.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(first.status, 201);

    const second = await agent.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(second.status, 400);
    assert.match(second.body.message, /استخدمت هذا الكوبون مسبقاً/);
  });

  test("enforces the coupon's total usageLimit across different customers", async () => {
    const coupon = await createCoupon(adminAgent, { serviceId: service.id, usageLimit: 1 });

    const { agent: agentA } = await registerCustomer();
    const first = await agentA.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(first.status, 201);

    const { agent: agentB } = await registerCustomer();
    const second = await agentB.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(second.status, 400);
    assert.match(second.body.message, /استخدام هذا الكوبون بالكامل/);
  });

  test("newCustomersOnly rejects a customer who already has an order", async () => {
    const { agent } = await registerCustomer();
    // Give this customer a prior order (no coupon) before the new-customers-only coupon exists for them.
    const plainOrder = await agent.post("/api/customer/orders").send({ serviceId: service.id });
    assert.equal(plainOrder.status, 201);

    const coupon = await createCoupon(adminAgent, { serviceId: service.id, newCustomersOnly: true });
    const res = await agent.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /الجدد فقط/);
  });

  test("newCustomersOnly allows a customer with no prior orders", async () => {
    const coupon = await createCoupon(adminAgent, { serviceId: service.id, newCustomersOnly: true });
    const { agent } = await registerCustomer();
    const res = await agent.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(res.status, 201);
  });

  test("overview reflects an order placed with a coupon", async () => {
    const coupon = await createCoupon(adminAgent, { serviceId: service.id, discountValue: 15 });
    const { agent } = await registerCustomer();

    const created = await agent.post("/api/customer/orders").send({ serviceId: service.id, couponCode: coupon.code });
    assert.equal(created.status, 201);

    const overview = await agent.get("/api/customer/overview");
    assert.equal(overview.status, 200);
    assert.equal(overview.body.data.activeOrdersCount, 1);
    assert.equal(overview.body.data.recentOrders[0].couponCode, coupon.code);
  });

  test("an order created without a coupon never carries coupon snapshot fields", async () => {
    const { agent } = await registerCustomer();
    const res = await agent.post("/api/customer/orders").send({ serviceId: service.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.couponCode, null);
    assert.equal(res.body.data.originalAmount, null);
  });

});
