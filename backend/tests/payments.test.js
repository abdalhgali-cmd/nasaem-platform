import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("payments", () => {
  let agent;
  let customerId;
  let serviceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Payment Test Customer",
      passportNo: "PAY" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "PAY-SVC-" + uniqueSuffix(),
      name: "Payment Test Service",
      category: "test",
      basePrice: 100,
    });
    serviceId = serviceRes.body.data.id;
  });

  async function createOrder(unitPrice) {
    const res = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice }],
    });
    return res.body.data;
  }

  test("marks an order PAID immediately in the same response after full payment", async () => {
    const order = await createOrder(100);

    const paymentRes = await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "cash",
    });

    assert.equal(paymentRes.status, 201);
    // Regression: recalculateOrderPaymentStatus used to run against the
    // non-transactional client, so it read stale data and this used to be
    // "UNPAID" here despite a full payment having just been recorded.
    assert.equal(paymentRes.body.data.order.paymentStatus, "PAID");

    const getRes = await agent.get(`/api/orders/${order.id}`);
    assert.equal(getRes.body.data.paymentStatus, "PAID");
  });

  test("excludes REFUNDED payments from the paid total", async () => {
    const order = await createOrder(100);

    await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "cash",
      status: "REFUNDED",
    });

    const getRes = await agent.get(`/api/orders/${order.id}`);
    // Regression: a REFUNDED payment used to still count toward the paid
    // total, incorrectly marking a fully-refunded order as PAID.
    assert.equal(getRes.body.data.paymentStatus, "UNPAID");
  });

  test("marks an order PARTIAL when the paid amount is less than the total", async () => {
    const order = await createOrder(100);

    await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 40,
      paymentMethod: "cash",
    });

    const getRes = await agent.get(`/api/orders/${order.id}`);
    assert.equal(getRes.body.data.paymentStatus, "PARTIAL");
  });

  test("excludes UNPAID-status payments from the paid total, same as REFUNDED", async () => {
    const order = await createOrder(100);

    await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "cash",
      status: "UNPAID",
    });

    const getRes = await agent.get(`/api/orders/${order.id}`);
    // Regression: a payment explicitly marked UNPAID (e.g. a bounced
    // transfer) used to still count toward the paid total, exactly like a
    // real payment would.
    assert.equal(getRes.body.data.paymentStatus, "UNPAID");
  });

  test("404s when recording a payment against a non-existent order", async () => {
    const res = await agent.post("/api/payments").send({
      orderId: "does-not-exist",
      amount: 10,
      paymentMethod: "cash",
    });
    assert.equal(res.status, 404);
  });
});
