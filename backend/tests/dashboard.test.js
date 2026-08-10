import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Reads the shared test DB, so assertions use deltas (before/after a known
// order+payment) rather than absolute totals — other test files' orders and
// payments land in the same numbers.
describe("dashboard stats", () => {
  let agent;
  let customerId;
  let serviceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Dashboard Test Customer",
      passportNo: "DASH" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "DASH-SVC-" + uniqueSuffix(),
      name: "Dashboard Test Service",
      category: "test",
      basePrice: 100,
    });
    serviceId = serviceRes.body.data.id;
  });

  test("revenue and outstanding balance move by exactly the expected amounts", async () => {
    const before = (await agent.get("/api/dashboard/stats")).body.data;

    const orderRes = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice: 100 }],
    });
    assert.equal(orderRes.status, 201);

    const afterOrder = (await agent.get("/api/dashboard/stats")).body.data;
    assert.equal(afterOrder.outstandingBalance, before.outstandingBalance + 100);
    assert.equal(afterOrder.totalRevenue, before.totalRevenue);

    await agent.post("/api/payments").send({
      orderId: orderRes.body.data.id,
      amount: 60,
      paymentMethod: "cash",
    });

    const afterPayment = (await agent.get("/api/dashboard/stats")).body.data;
    assert.equal(afterPayment.totalRevenue, before.totalRevenue + 60);
    assert.equal(afterPayment.outstandingBalance, before.outstandingBalance + 40);
  });

  test("a CANCELLED order does not count toward outstanding balance", async () => {
    const before = (await agent.get("/api/dashboard/stats")).body.data;

    const orderRes = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice: 75 }],
    });
    await agent.patch(`/api/orders/${orderRes.body.data.id}/status`).send({ status: "CANCELLED" });

    const after = (await agent.get("/api/dashboard/stats")).body.data;
    assert.equal(after.outstandingBalance, before.outstandingBalance);
  });
});
