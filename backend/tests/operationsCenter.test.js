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

describe("operations center: payment review visibility", () => {
  test("a fresh receipt under review is listed even when more than 50 older open requests exist", async () => {
    const { default: prisma } = await import("../src/config/database.js");
    const marker = `TEST-WF-OPS-${Date.now()}`;
    const old = new Date("2020-01-01T00:00:00Z");
    await prisma.contactRequest.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ name: `${marker} old ${i}`, phone: "0900000000", phoneNormalized: "249900000000", message: marker, createdAt: old, updatedAt: old })),
    });
    const fresh = await prisma.contactRequest.create({ data: { name: `${marker} receipt`, phone: "0900000001", phoneNormalized: "249900000001", message: marker, paymentStatus: "UNDER_REVIEW" } });
    try {
      const agent = await loginAsSuperAdmin();
      const res = await agent.get("/api/dashboard/operations");
      assert.equal(res.status, 200);
      const item = res.body.data.items.find((row) => row.id === fresh.id);
      assert.ok(item, "the receipt waiting for review must be listed");
      assert.equal(item.hasPaymentUnderReview, true);
    } finally {
      await prisma.contactRequest.deleteMany({ where: { message: marker } });
    }
  });
});
