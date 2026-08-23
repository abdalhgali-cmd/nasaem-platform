import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("umrah groups", () => {
  let agent;
  let umrahServiceId;
  let flightServiceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const umrahSvc = await agent.post("/api/services").send({
      code: "UG-UMRAH-" + uniqueSuffix(),
      name: "Umrah group test service",
      category: "umrah",
      basePrice: 100,
    });
    umrahServiceId = umrahSvc.body.data.id;

    const flightSvc = await agent.post("/api/services").send({
      code: "UG-FLIGHT-" + uniqueSuffix(),
      name: "Flight group test service",
      category: "flight",
      basePrice: 100,
    });
    flightServiceId = flightSvc.body.data.id;
  });

  async function createCustomer(label) {
    const res = await agent.post("/api/customers").send({
      fullName: `Umrah Group ${label} ${uniqueSuffix()}`,
      passportNo: "UG" + uniqueSuffix(),
      nationality: "Test",
    });
    return res.body.data;
  }

  async function createOrder(customerId, serviceId) {
    const res = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice: 100 }],
    });
    return res.body.data;
  }

  async function uploadDocument(orderId, customerId, type) {
    return agent
      .post("/api/documents")
      .field("orderId", orderId)
      .field("customerId", customerId)
      .field("type", type)
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: `${type}.png`, contentType: "image/png" });
  }

  test("creates a group with a unique generated code", async () => {
    const res = await agent.post("/api/umrah-groups").send({
      name: "Ramadan Batch " + uniqueSuffix(),
      travelDate: "2027-03-01T00:00:00.000Z",
      airline: "Saudia",
      hotel: "Hilton Makkah",
      transport: "Bus",
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.code.startsWith("UG-"));
    assert.equal(res.body.data.summary.totalMembers, 0);
  });

  test("rejects a group without a name", async () => {
    const res = await agent.post("/api/umrah-groups").send({ airline: "Saudia" });
    assert.equal(res.status, 400);
  });

  test("adds a member without an order — not ready by default", async () => {
    const groupRes = await agent.post("/api/umrah-groups").send({ name: "Group No Order " + uniqueSuffix() });
    const customer = await createCustomer("NoOrder");

    const memberRes = await agent.post(`/api/umrah-groups/${groupRes.body.data.id}/members`).send({ customerId: customer.id });
    assert.equal(memberRes.status, 201);
    assert.equal(memberRes.body.data.readiness.hasOrder, false);
    assert.equal(memberRes.body.data.readiness.fullyReady, false);

    const groupDetail = await agent.get(`/api/umrah-groups/${groupRes.body.data.id}`);
    assert.equal(groupDetail.body.data.summary.totalMembers, 1);
    assert.equal(groupDetail.body.data.summary.fullyReady, 0);
  });

  test("rejects adding the same customer to a group twice", async () => {
    const groupRes = await agent.post("/api/umrah-groups").send({ name: "Group Dup " + uniqueSuffix() });
    const customer = await createCustomer("Dup");
    await agent.post(`/api/umrah-groups/${groupRes.body.data.id}/members`).send({ customerId: customer.id });

    const dupRes = await agent.post(`/api/umrah-groups/${groupRes.body.data.id}/members`).send({ customerId: customer.id });
    assert.equal(dupRes.status, 409);
  });

  test("rejects linking a member to an order that belongs to a different customer", async () => {
    const groupRes = await agent.post("/api/umrah-groups").send({ name: "Group Mismatch " + uniqueSuffix() });
    const customerA = await createCustomer("A");
    const customerB = await createCustomer("B");
    const orderForB = await createOrder(customerB.id, umrahServiceId);

    const res = await agent.post(`/api/umrah-groups/${groupRes.body.data.id}/members`).send({ customerId: customerA.id, orderId: orderForB.id });
    assert.equal(res.status, 409);
  });

  test("readiness tracks the linked order's visa/ticket/payment/document state live", async () => {
    const groupRes = await agent.post("/api/umrah-groups").send({ name: "Group Readiness " + uniqueSuffix() });
    const groupId = groupRes.body.data.id;
    const customer = await createCustomer("Readiness");
    const order = await createOrder(customer.id, umrahServiceId);

    const memberRes = await agent.post(`/api/umrah-groups/${groupId}/members`).send({ customerId: customer.id, orderId: order.id });
    assert.equal(memberRes.status, 201);
    const memberId = memberRes.body.data.id;

    let detail = await agent.get(`/api/umrah-groups/${groupId}`);
    let member = detail.body.data.members.find((m) => m.id === memberId);
    assert.equal(member.readiness.hasOrder, true);
    assert.equal(member.readiness.paymentReady, false);
    assert.equal(member.readiness.documentsReady, false);
    assert.equal(member.readiness.visaReady, false);
    assert.equal(member.readiness.ticketReady, false);
    assert.equal(member.readiness.fullyReady, false);

    // Umrah requires PASSPORT + PHOTO (see SERVICE_DOCUMENT_REQUIREMENTS).
    await uploadDocument(order.id, customer.id, "PASSPORT");
    await uploadDocument(order.id, customer.id, "PHOTO");
    await agent.post("/api/payments").send({ orderId: order.id, amount: 100, paymentMethod: "cash" });
    await uploadDocument(order.id, customer.id, "VISA");
    await uploadDocument(order.id, customer.id, "TICKET");

    detail = await agent.get(`/api/umrah-groups/${groupId}`);
    member = detail.body.data.members.find((m) => m.id === memberId);
    assert.equal(member.readiness.paymentReady, true);
    assert.equal(member.readiness.documentsReady, true);
    assert.equal(member.readiness.visaReady, true);
    assert.equal(member.readiness.ticketReady, true);
    assert.equal(member.readiness.fullyReady, true);
    assert.equal(detail.body.data.summary.fullyReady, 1);
  });

  test("a group mixing services requires the union of both services' documents for readiness", async () => {
    const groupRes = await agent.post("/api/umrah-groups").send({ name: "Group Mixed " + uniqueSuffix() });
    const customer = await createCustomer("Mixed");
    const orderRes = await agent.post("/api/orders").send({
      customerId: customer.id,
      items: [
        { serviceId: umrahServiceId, quantity: 1, unitPrice: 100 },
        { serviceId: flightServiceId, quantity: 1, unitPrice: 100 },
      ],
    });
    const order = orderRes.body.data;
    await agent.post(`/api/umrah-groups/${groupRes.body.data.id}/members`).send({ customerId: customer.id, orderId: order.id });

    await uploadDocument(order.id, customer.id, "PASSPORT");
    let detail = await agent.get(`/api/umrah-groups/${groupRes.body.data.id}`);
    assert.equal(detail.body.data.members[0].readiness.documentsReady, false, "still missing the photo umrah requires");

    await uploadDocument(order.id, customer.id, "PHOTO");
    detail = await agent.get(`/api/umrah-groups/${groupRes.body.data.id}`);
    assert.equal(detail.body.data.members[0].readiness.documentsReady, true);
  });

  test("updates and removes a member", async () => {
    const groupRes = await agent.post("/api/umrah-groups").send({ name: "Group Update " + uniqueSuffix() });
    const groupId = groupRes.body.data.id;
    const customer = await createCustomer("Update");
    const memberRes = await agent.post(`/api/umrah-groups/${groupId}/members`).send({ customerId: customer.id });
    const memberId = memberRes.body.data.id;

    const patchRes = await agent.patch(`/api/umrah-groups/${groupId}/members/${memberId}`).send({ notes: "VIP traveler" });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.notes, "VIP traveler");

    const deleteRes = await agent.delete(`/api/umrah-groups/${groupId}/members/${memberId}`);
    assert.equal(deleteRes.status, 200);

    const detail = await agent.get(`/api/umrah-groups/${groupId}`);
    assert.equal(detail.body.data.summary.totalMembers, 0);
  });

  test("404s for a group that doesn't exist", async () => {
    const res = await agent.get("/api/umrah-groups/does-not-exist");
    assert.equal(res.status, 404);
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/umrah-groups");
    assert.equal(res.status, 401);
  });
});
