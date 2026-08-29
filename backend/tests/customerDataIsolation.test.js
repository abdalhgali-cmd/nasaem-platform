import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, registerCustomer, uniqueSuffix } from "./helpers/api.js";

// Split out from orderCouponPricing.test.js so each file's register()
// calls stay comfortably under customer-auth's rate limiter (10 per 15
// minutes — see customer-auth.routes.js's authLimiter), which each test
// file exercises against its own isolated process/store (Node's test
// runner isolates test files by default).
describe("customer data isolation (IDOR/BOLA)", () => {
  let adminAgent;
  let service;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
    const suffix = uniqueSuffix();
    const res = await adminAgent.post("/api/services").send({
      code: `SVC-ISO-${suffix}`,
      name: `Isolation Test Service ${suffix}`,
      category: "qa-isolation-test",
      basePrice: 50,
      currency: "SAR",
    });
    assert.equal(res.status, 201);
    service = res.body.data;
  });

  test("a customer can never read or list another customer's orders", async () => {
    const { agent: agentA } = await registerCustomer();
    const created = await agentA.post("/api/customer/orders").send({ serviceId: service.id });
    assert.equal(created.status, 201);
    const orderId = created.body.data.id;

    const { agent: agentB } = await registerCustomer();
    const stolenRead = await agentB.get(`/api/customer/orders/${orderId}`);
    assert.equal(stolenRead.status, 404);

    const listB = await agentB.get("/api/customer/orders");
    assert.equal(listB.status, 200);
    assert.equal(listB.body.data.some((order) => order.id === orderId), false);

    const ownRead = await agentA.get(`/api/customer/orders/${orderId}`);
    assert.equal(ownRead.status, 200);
    assert.equal(ownRead.body.data.id, orderId);
  });

  test("a customer's document list never includes another customer's documents", async () => {
    const { agent: agentA } = await registerCustomer();
    const { agent: agentB } = await registerCustomer();

    const docsA = await agentA.get("/api/customer/documents");
    const docsB = await agentB.get("/api/customer/documents");
    assert.equal(docsA.status, 200);
    assert.equal(docsB.status, 200);
    assert.ok(Array.isArray(docsA.body.data));
    assert.ok(Array.isArray(docsB.body.data));
  });

  test("a coupon restricted to one customer never appears in another customer's coupon list", async () => {
    const { agent: agentA, customer: customerA } = await registerCustomer();
    const suffix = uniqueSuffix();
    const created = await adminAgent.post("/api/coupons").send({
      code: `PRIV-${suffix}`,
      discountType: "FIXED",
      discountValue: 10,
      customerId: customerA.id,
    });
    assert.equal(created.status, 201);

    const listA = await agentA.get("/api/customer/coupons");
    assert.equal(listA.status, 200);
    assert.ok(listA.body.data.available.some((coupon) => coupon.code === created.body.data.code));

    const { agent: agentB } = await registerCustomer();
    const listB = await agentB.get("/api/customer/coupons");
    assert.equal(listB.status, 200);
    assert.equal(listB.body.data.available.some((coupon) => coupon.code === created.body.data.code), false);
  });
});
