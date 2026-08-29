import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// End-to-end coverage of the full order lifecycle guard: a per-service
// document checklist (flight needs only a passport; umrah also needs a
// photo) combined with the confirmed-payment requirement, driven entirely
// through the real HTTP API against a real database — not just the unit
// tests in orderStatusTransitions.test.js.
describe("order completion — document + payment readiness", () => {
  let agent;
  let customerId;
  let flightServiceId;
  let umrahServiceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Completion Readiness Customer",
      passportNo: "CRC" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const flightSvc = await agent.post("/api/services").send({
      code: "CRC-FLIGHT-" + uniqueSuffix(),
      name: "Flight readiness test",
      category: "flight",
      basePrice: 100,
    });
    flightServiceId = flightSvc.body.data.id;

    const umrahSvc = await agent.post("/api/services").send({
      code: "CRC-UMRAH-" + uniqueSuffix(),
      name: "Umrah readiness test",
      category: "umrah",
      basePrice: 100,
    });
    umrahServiceId = umrahSvc.body.data.id;
  });

  async function createOrder(serviceId) {
    const res = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice: 100 }],
    });
    return res.body.data;
  }

  async function payInFull(orderId) {
    await agent.post("/api/payments").send({ orderId, amount: 100, paymentMethod: "cash" });
  }

  async function uploadDocument(orderId, type) {
    return agent
      .post("/api/documents")
      .field("orderId", orderId)
      .field("customerId", customerId)
      .field("type", type)
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: `${type}.png`, contentType: "image/png" });
  }

  async function advanceToApproved(orderId) {
    for (const status of ["UNDER_REVIEW", "PAYMENT_PENDING", "PROCESSING", "APPROVED"]) {
      const res = await agent.patch(`/api/orders/${orderId}/status`).send({ status });
      assert.equal(res.status, 200, `expected ${status} transition to succeed`);
    }
  }

  test("a flight order can complete with just a passport once paid", async () => {
    const order = await createOrder(flightServiceId);
    await advanceToApproved(order.id);

    const beforeDocs = await agent.patch(`/api/orders/${order.id}/status`).send({ status: "COMPLETED" });
    assert.equal(beforeDocs.status, 409);

    await payInFull(order.id);
    const beforePaidRecheck = await agent.patch(`/api/orders/${order.id}/status`).send({ status: "COMPLETED" });
    assert.equal(beforePaidRecheck.status, 409, "still missing the passport");

    const upload = await uploadDocument(order.id, "PASSPORT");
    assert.equal(upload.status, 201);

    const completeRes = await agent.patch(`/api/orders/${order.id}/status`).send({ status: "COMPLETED" });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.status, "COMPLETED");
  });

  test("an umrah order cannot complete with only a passport — it also needs a photo", async () => {
    const order = await createOrder(umrahServiceId);
    await advanceToApproved(order.id);
    await payInFull(order.id);
    await uploadDocument(order.id, "PASSPORT");

    const missingPhoto = await agent.patch(`/api/orders/${order.id}/status`).send({ status: "COMPLETED" });
    assert.equal(missingPhoto.status, 409);

    await uploadDocument(order.id, "PHOTO");
    const completeRes = await agent.patch(`/api/orders/${order.id}/status`).send({ status: "COMPLETED" });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.status, "COMPLETED");
  });

  test("a pending-review payment alone never satisfies the payment guard", async () => {
    const order = await createOrder(flightServiceId);
    await advanceToApproved(order.id);
    await uploadDocument(order.id, "PASSPORT");

    await agent.post("/api/payments").send({ orderId: order.id, amount: 100, paymentMethod: "bank_transfer", pendingReview: true });

    const stillBlocked = await agent.patch(`/api/orders/${order.id}/status`).send({ status: "COMPLETED" });
    assert.equal(stillBlocked.status, 409);
  });
});
