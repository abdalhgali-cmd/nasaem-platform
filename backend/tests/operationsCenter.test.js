import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin } from "./helpers/api.js";

describe("operations center", () => {
  test("returns a unified queue for staff users", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.get("/api/dashboard/operations");

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(res.body.data);
    assert.ok(res.body.data.queues);
    assert.ok(Array.isArray(res.body.data.items));
    [
      "newRequests",
      "waitingPaymentReview",
      "unassignedOrders",
      "waitingDocuments",
      "waitingCustomer",
      "readyToDeliver",
      "stalled",
    ].forEach((key) => assert.equal(typeof res.body.data.queues[key], "number"));

    for (const item of res.body.data.items) {
      assert.ok(item.id);
      assert.ok(item.reference);
      assert.ok(item.customerName);
      assert.ok(item.nextAction?.key);
      assert.ok(item.nextAction?.label);
      assert.equal(typeof item.ageHours, "number");
      assert.ok(item.ageHours >= 0);
      assert.equal("passwordHash" in item, false);
    }
  });
});
