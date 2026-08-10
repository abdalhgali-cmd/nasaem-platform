import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("orders", () => {
  let agent;
  let customerId;
  let serviceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Order Test Customer",
      passportNo: "ORD" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "TEST-SVC-" + uniqueSuffix(),
      name: "Test Service",
      category: "test",
      basePrice: 100,
    });
    serviceId = serviceRes.body.data.id;
  });

  function orderPayload(overrides = {}) {
    return {
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice: 50 }],
      ...overrides,
    };
  }

  test("generates unique order numbers even when created concurrently", async () => {
    // Regression test: order numbers used to be generated via
    // count()+1, which is a race condition under concurrent requests.
    const [a, b, c] = await Promise.all([
      agent.post("/api/orders").send(orderPayload()),
      agent.post("/api/orders").send(orderPayload()),
      agent.post("/api/orders").send(orderPayload()),
    ]);

    for (const res of [a, b, c]) {
      assert.equal(res.status, 201);
    }

    const numbers = [a, b, c].map((res) => res.body.data.orderNumber);
    assert.equal(new Set(numbers).size, 3, `order numbers must be unique: ${numbers.join(", ")}`);
  });

  test("rejects an invalid status transition with 409", async () => {
    const createRes = await agent.post("/api/orders").send(orderPayload());
    const orderId = createRes.body.data.id;

    const res = await agent.patch(`/api/orders/${orderId}/status`).send({ status: "COMPLETED" });
    assert.equal(res.status, 409);
  });

  test("allows a valid status transition", async () => {
    const createRes = await agent.post("/api/orders").send(orderPayload());
    const orderId = createRes.body.data.id;

    const res = await agent.patch(`/api/orders/${orderId}/status`).send({ status: "UNDER_REVIEW" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "UNDER_REVIEW");
  });

  test("rejects an out-of-range priority value", async () => {
    const res = await agent.post("/api/orders").send(orderPayload({ priority: "SUPER_URGENT" }));
    assert.equal(res.status, 400);
  });

  test("rejects an unsupported currency", async () => {
    const res = await agent.post("/api/orders").send(orderPayload({ currency: "XXX" }));
    assert.equal(res.status, 400);
  });

  // Regression test: a discount larger than the item's own price used to
  // drive totalAmount negative, which then let the very first payment
  // (however small) satisfy totalPaid >= totalAmount and mark the order
  // PAID despite no real money being collected.
  test("rejects a discount larger than the item's own price", async () => {
    const res = await agent.post("/api/orders").send(
      orderPayload({ items: [{ serviceId, quantity: 1, unitPrice: 50, discount: 500 }] })
    );
    assert.equal(res.status, 400);
  });

  test("allows a discount exactly equal to the item's price (total of zero)", async () => {
    const res = await agent.post("/api/orders").send(
      orderPayload({ items: [{ serviceId, quantity: 1, unitPrice: 50, discount: 50 }] })
    );
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.data.totalAmount), 0);
  });

  test("assigns an order to a staff member and reflects it on the order", async () => {
    const createRes = await agent.post("/api/orders").send(orderPayload());
    const orderId = createRes.body.data.id;

    const meRes = await agent.get("/api/auth/me");
    const selfId = meRes.body.data.id;

    const assignRes = await agent.patch(`/api/orders/${orderId}/assign`).send({ assignedUserId: selfId });
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.data.assignedUserId, selfId);

    const unassignRes = await agent.patch(`/api/orders/${orderId}/assign`).send({ assignedUserId: null });
    assert.equal(unassignRes.status, 200);
    assert.equal(unassignRes.body.data.assignedUserId, null);
  });
});
