import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Only one fresh ContactRequest is created in this whole file — the public
// POST /api/contact-requests endpoint enforces a hard 5-per-window rate
// limit shared across this file's process (see contactRequests.test.js and
// the other contactRequest*.test.js files, which budget the same way).
async function submitContactRequest(phone) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Close Outcome Test User",
      phone,
      message: "طلب اختبار لتدفق إغلاق الطلب بنتيجة محددة",
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

async function loginTrackingAgent(phone) {
  const agent = request.agent(app);
  const requestRes = await request(app).post("/api/tracking/request-code").send({ phone });
  const verifyRes = await agent
    .post("/api/tracking/verify-code")
    .send({ phone, code: requestRes.body.debugCode });
  assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
  return agent;
}

describe("contact request close outcomes", () => {
  let superAdminAgent;
  let phone;
  let contactRequestId;
  let customerAgent;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
    phone = `0941${uniqueSuffix()}`;
    contactRequestId = await submitContactRequest(phone);
    customerAgent = await loginTrackingAgent(phone);
  });

  test("closing without an outcome is rejected", async () => {
    const res = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CLOSED" });

    assert.equal(res.status, 400);
    assert.ok(res.body.errors.fieldErrors.outcome);
  });

  test("closing with an invalid outcome value is rejected", async () => {
    const res = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CLOSED", outcome: "NOT_A_REAL_OUTCOME" });

    assert.equal(res.status, 400);
  });

  test("a non-CLOSED transition doesn't require (or need) an outcome", async () => {
    const res = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CONTACTED" });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "CONTACTED");
    assert.equal(res.body.data.outcome, null);
  });

  test("full flow: close with an outcome + note, customer sees it, reopen clears it", async () => {
    const closeRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({
        status: "CLOSED",
        outcome: "COMPLETED",
        outcomeNote: "تم إصدار التأشيرة وتسليمها للعميل",
      });

    assert.equal(closeRes.status, 200, JSON.stringify(closeRes.body));
    assert.equal(closeRes.body.data.status, "CLOSED");
    assert.equal(closeRes.body.data.outcome, "COMPLETED");
    assert.equal(closeRes.body.data.outcomeNote, "تم إصدار التأشيرة وتسليمها للعميل");
    assert.ok(closeRes.body.data.closedAt);

    const trackedRes = await customerAgent.get("/api/tracking/requests");
    const tracked = trackedRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(tracked.outcome, "COMPLETED");
    assert.equal(tracked.statusLabel, "تم إنجاز طلبك بنجاح");

    // Reopening clears the stale outcome — it shouldn't linger on a request
    // that's active again.
    const reopenRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "NEW" });

    assert.equal(reopenRes.status, 200);
    assert.equal(reopenRes.body.data.outcome, null);
    assert.equal(reopenRes.body.data.outcomeNote, null);
    assert.equal(reopenRes.body.data.closedAt, null);

    const trackedAfterReopenRes = await customerAgent.get("/api/tracking/requests");
    const trackedAfterReopen = trackedAfterReopenRes.body.data.find(
      (r) => r.id === contactRequestId
    );
    assert.equal(trackedAfterReopen.statusLabel, "تم استلام طلبك وهو قيد المراجعة");
  });

  test("re-closing with a different outcome replaces the previous one", async () => {
    await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CLOSED", outcome: "REJECTED", outcomeNote: "لم تكتمل المستندات" });

    const rejectedRes = await customerAgent.get("/api/tracking/requests");
    let tracked = rejectedRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(tracked.statusLabel, "تم رفض الطلب");

    // Reopen, then close again with a different outcome — the old note
    // must not survive.
    await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CONTACTED" });
    await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CLOSED", outcome: "CANCELLED" });

    const cancelledRes = await customerAgent.get("/api/tracking/requests");
    tracked = cancelledRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(tracked.statusLabel, "تم إلغاء الطلب");
    assert.equal(tracked.outcomeNote, null);
  });
});
