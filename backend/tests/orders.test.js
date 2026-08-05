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
});
