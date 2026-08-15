import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends 4 of publicContactLimiter's 5 POST /contact-requests and 4 of
// request-code's 5/15min/IP (one full quote-approve-confirm customer flow
// per test — no test in this file may add a fifth).
//
// This is the first test file in this repo to import Prisma directly
// (`import prisma from "../src/config/database.js"`) rather than driving
// everything through supertest — there is no endpoint that can backdate
// `createdAt`, which the date-axis test below needs. This resolves to the
// same singleton `app.js` already holds, so it opens no second connection
// and adds no new process-lifetime risk.
async function loginAsCustomer(phone) {
  const codeRes = await request(app).post("/api/customer-auth/request-code").send({ phone });
  assert.equal(codeRes.status, 200);

  const agent = request.agent(app);
  const verifyRes = await agent.post("/api/customer-auth/verify-code").send({
    loginCodeId: codeRes.body.data.loginCodeId,
    code: codeRes.body.data.debugCode,
  });
  assert.equal(verifyRes.status, 200);

  return agent;
}

// Creates a FLIGHTS request, quotes it, and (optionally) drives it all the
// way to a CONFIRMED payment — shared by every test below.
async function createQuotedFlightsRequest(adminAgent, { confirm = false } = {}) {
  const phone = `09${uniqueSuffix().slice(-6)}05`;
  const createRes = await request(app).post("/api/contact-requests").send({
    name: "Refund Test Owner",
    phone,
    service: "طيران",
    details: { من: "الخرطوم", إلى: "جدة" },
  });
  assert.equal(createRes.status, 201);
  const id = createRes.body.data.id;

  const quoteRes = await adminAgent.patch(`/api/contact-requests/${id}/payment`).send({
    currency: "SAR",
    paymentAmount: 500,
  });
  assert.equal(quoteRes.status, 200);

  const customerAgent = await loginAsCustomer(phone);
  const approveRes = await customerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
  assert.equal(approveRes.status, 200);

  if (confirm) {
    const confirmRes = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({ status: "CONFIRMED" });
    assert.equal(confirmRes.status, 200);
  }

  return { id, customerAgent };
}

describe("contact request payment refunds", () => {
  let adminAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  test("revenue reports by payment-confirmation date, not creation date", async () => {
    const { id } = await createQuotedFlightsRequest(adminAgent, { confirm: true });

    // Backdate only createdAt — paymentConfirmedAt stays "now" from the
    // confirm above, which is exactly the scenario the fix addresses.
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.contactRequest.update({ where: { id }, data: { createdAt: fortyDaysAgo } });

    const today = new Date().toISOString().slice(0, 10);
    const todayRangeBefore = (await adminAgent.get(`/api/reports/summary?from=${today}&department=FLIGHTS`)).body.data;

    // A range covering only today: the request was "created" outside it,
    // so total must not count it, but revenue (paymentConfirmedAt-based)
    // must, since the payment was confirmed today.
    assert.ok((todayRangeBefore.byDepartment.FLIGHTS.revenue.SAR || 0) >= 500);

    const oldRangeTo = new Date(Date.now() - 39 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const oldRange = (await adminAgent.get(`/api/reports/summary?to=${oldRangeTo}&department=FLIGHTS`)).body.data;
    // A range ending before today: the request WAS created in it (total
    // counts it), but the payment was confirmed today, outside this range,
    // so revenue must not count it.
    assert.ok(oldRange.byDepartment.FLIGHTS.count >= 1);
    assert.equal(oldRange.byDepartment.FLIGHTS.revenue.SAR || 0, 0);
  });

  test("REFUNDED is only reachable from CONFIRMED", async () => {
    const { id } = await createQuotedFlightsRequest(adminAgent, { confirm: false });

    // Still AWAITING_TRANSFER (approved but not yet confirmed by staff).
    const res = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({ status: "REFUNDED" });
    assert.equal(res.status, 400);
  });

  test("refund transition: revenue drops, terminal guard, executionStage auto-cancels mid-execution", async () => {
    const { id } = await createQuotedFlightsRequest(adminAgent, { confirm: true });

    const beforeRevenue = (await adminAgent.get("/api/reports/summary?department=FLIGHTS")).body.data.byDepartment.FLIGHTS
      .revenue.SAR || 0;

    const startRes = await adminAgent.patch(`/api/contact-requests/${id}/execution-stage`).send({ stage: "AWAITING_EXECUTION" });
    assert.equal(startRes.status, 200);

    const refundRes = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({ status: "REFUNDED" });
    assert.equal(refundRes.status, 200);
    assert.equal(refundRes.body.data.paymentStatus, "REFUNDED");
    assert.equal(refundRes.body.data.executionStage, "CANCELLED");

    const afterRevenue = (await adminAgent.get("/api/reports/summary?department=FLIGHTS")).body.data.byDepartment.FLIGHTS
      .revenue.SAR || 0;
    assert.equal(afterRevenue, beforeRevenue - 500);

    const listRes = await adminAgent.get("/api/contact-requests?limit=100");
    const row = listRes.body.data.find((r) => r.id === id);
    const autoCancelEntry = row.executionHistory.find((h) => h.newStage === "CANCELLED");
    assert.equal(autoCancelEntry.notes, "إلغاء تلقائي بسبب استرجاع الدفعة");
    assert.equal(autoCancelEntry.oldStage, "AWAITING_EXECUTION");

    // Terminal: no further paymentStatus transition, including a second
    // REFUNDED or a "correction" back to CONFIRMED.
    const secondRefundRes = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({ status: "REFUNDED" });
    assert.equal(secondRefundRes.status, 400);
    const backToConfirmedRes = await adminAgent
      .patch(`/api/contact-requests/${id}/payment-status`)
      .send({ status: "CONFIRMED" });
    assert.equal(backToConfirmedRes.status, 400);
  });

  test("refunding a request already DELIVERED_TO_CUSTOMER leaves that stage untouched", async () => {
    const { id } = await createQuotedFlightsRequest(adminAgent, { confirm: true });

    for (const stage of ["AWAITING_EXECUTION", "TICKETS_BOOKED", "TICKETS_ISSUED", "DELIVERED_TO_CUSTOMER"]) {
      const res = await adminAgent.patch(`/api/contact-requests/${id}/execution-stage`).send({ stage });
      assert.equal(res.status, 200);
    }

    const refundRes = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({ status: "REFUNDED" });
    assert.equal(refundRes.status, 200);
    // A goodwill refund after delivery must not falsify the audit trail by
    // rewriting an already-terminal stage.
    assert.equal(refundRes.body.data.executionStage, "DELIVERED_TO_CUSTOMER");
  });
});
