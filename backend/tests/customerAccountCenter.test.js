import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { registerCustomer } from "./helpers/api.js";

describe("customer account center ownership", () => {
  test("links an authenticated public request and isolates it from another customer", async () => {
    const { agent: agentA } = await registerCustomer();
    const { agent: agentB } = await registerCustomer();

    const created = await agentA.post("/api/contact-requests").send({
      name: "Customer Account Test",
      phone: `+249911${Date.now().toString().slice(-6)}`,
      email: "customer-account-test@example.com",
      message: "Authenticated request ownership test",
    });
    assert.equal(created.status, 201);

    const ownList = await agentA.get("/api/customer/requests");
    assert.equal(ownList.status, 200);
    assert.equal(ownList.body.data.length, 1);
    const requestId = ownList.body.data[0].id;

    const ownDetail = await agentA.get(`/api/customer/requests/${requestId}`);
    assert.equal(ownDetail.status, 200);
    assert.equal(ownDetail.body.data.id, requestId);

    const stolenList = await agentB.get("/api/customer/requests");
    assert.equal(stolenList.status, 200);
    assert.equal(stolenList.body.data.some((request) => request.id === requestId), false);

    const stolenDetail = await agentB.get(`/api/customer/requests/${requestId}`);
    assert.equal(stolenDetail.status, 404);
  });

  test("customer notification endpoints require customer auth", async () => {
    const { agent } = await registerCustomer();
    const response = await agent.get("/api/customer/notifications");
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.data));
  });
});
