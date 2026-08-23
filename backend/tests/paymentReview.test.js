import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("payment review workflow", () => {
  let agent;
  let customerId;
  let serviceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Payment Review Customer",
      passportNo: "PRV" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "PRV-SVC-" + uniqueSuffix(),
      name: "Payment Review Service",
      category: "test",
      basePrice: 100,
    });
    serviceId = serviceRes.body.data.id;
  });

  async function createOrder(unitPrice = 100) {
    const res = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice }],
    });
    return res.body.data;
  }

  test("a pending-review payment does not count toward the paid total until confirmed", async () => {
    const order = await createOrder(100);

    const paymentRes = await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "bank_transfer",
      pendingReview: true,
    });

    assert.equal(paymentRes.status, 201);
    assert.equal(paymentRes.body.data.reviewStatus, "PENDING");
    assert.equal(paymentRes.body.data.status, "UNPAID");
    // The order must not look PAID just because a receipt was logged —
    // only a confirmed payment can move the balance.
    assert.equal(paymentRes.body.data.order.paymentStatus, "UNPAID");

    const confirmRes = await agent.post(`/api/payments/${paymentRes.body.data.id}/confirm`);
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.reviewStatus, "CONFIRMED");
    assert.equal(confirmRes.body.data.status, "PAID");
    assert.equal(confirmRes.body.data.order.paymentStatus, "PAID");

    const getRes = await agent.get(`/api/orders/${order.id}`);
    assert.equal(getRes.body.data.paymentStatus, "PAID");
  });

  test("rejecting a pending payment records a reason and never marks the order paid", async () => {
    const order = await createOrder(100);

    const paymentRes = await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "bank_transfer",
      pendingReview: true,
    });

    const rejectRes = await agent
      .post(`/api/payments/${paymentRes.body.data.id}/reject`)
      .send({ reason: "Receipt does not match the bank account on file" });

    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.data.reviewStatus, "REJECTED");
    assert.equal(rejectRes.body.data.status, "UNPAID");
    assert.equal(rejectRes.body.data.rejectionReason, "Receipt does not match the bank account on file");

    const getRes = await agent.get(`/api/orders/${order.id}`);
    assert.equal(getRes.body.data.paymentStatus, "UNPAID");
  });

  test("rejects rejecting without a reason", async () => {
    const order = await createOrder(100);
    const paymentRes = await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "bank_transfer",
      pendingReview: true,
    });

    const res = await agent.post(`/api/payments/${paymentRes.body.data.id}/reject`).send({});
    assert.equal(res.status, 400);
  });

  test("a payment already decided cannot be re-confirmed or re-rejected", async () => {
    const order = await createOrder(100);
    const paymentRes = await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "bank_transfer",
      pendingReview: true,
    });

    const confirmRes = await agent.post(`/api/payments/${paymentRes.body.data.id}/confirm`);
    assert.equal(confirmRes.status, 200);

    const secondConfirm = await agent.post(`/api/payments/${paymentRes.body.data.id}/confirm`);
    assert.equal(secondConfirm.status, 409);

    const rejectAfterConfirm = await agent
      .post(`/api/payments/${paymentRes.body.data.id}/reject`)
      .send({ reason: "changed my mind" });
    assert.equal(rejectAfterConfirm.status, 409);
  });

  test("a directly recorded payment (no review) has no reviewStatus and cannot be confirmed/rejected", async () => {
    const order = await createOrder(100);
    const paymentRes = await agent.post("/api/payments").send({
      orderId: order.id,
      amount: 100,
      paymentMethod: "cash",
    });

    assert.equal(paymentRes.body.data.reviewStatus, null);
    assert.equal(paymentRes.body.data.status, "PAID");

    const confirmRes = await agent.post(`/api/payments/${paymentRes.body.data.id}/confirm`);
    assert.equal(confirmRes.status, 409);
  });

  test("404s confirming/rejecting a non-existent payment", async () => {
    const confirmRes = await agent.post("/api/payments/does-not-exist/confirm");
    assert.equal(confirmRes.status, 404);

    const rejectRes = await agent.post("/api/payments/does-not-exist/reject").send({ reason: "no such payment" });
    assert.equal(rejectRes.status, 404);
  });
});
