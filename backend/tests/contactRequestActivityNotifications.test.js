import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// logActivity/createNotification are fire-and-forget (not awaited) by the
// same convention used everywhere else in this codebase, so a write can
// still be in flight when our response comes back. Poll briefly instead of
// asserting instantly.
async function waitFor(assertion, { tries = 10, delayMs = 100 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (i === tries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Only two fresh ContactRequests are created in this whole file (one for
// the Invoice path, one for the mutually-exclusive Offers path) — the
// public POST /api/contact-requests endpoint enforces a hard 5-per-window
// rate limit shared across this file's process (see contactRequests.test.js
// and the other contactRequest*.test.js files, which budget the same way).
async function submitContactRequest(phone) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Activity Notification Test User",
      phone,
      message: "طلب اختبار لتغطية سجل النشاط والإشعارات",
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

async function assertLogged(adminAgent, action, entityId) {
  await waitFor(async () => {
    const res = await adminAgent.get("/api/activity-logs?limit=50");
    assert.equal(res.status, 200);
    const found = res.body.data.find(
      (entry) => entry.action === action && entry.entityId === entityId
    );
    assert.ok(found, `expected an ActivityLog entry for ${action} on ${entityId}`);
    return found;
  });
}

async function assertNotified(adminAgent, type, messageIncludes) {
  await waitFor(async () => {
    const res = await adminAgent.get("/api/notifications?limit=50");
    assert.equal(res.status, 200);
    const found = res.body.data.find(
      (n) => n.type === type && n.message.includes(messageIncludes)
    );
    assert.ok(found, `expected a Notification of type ${type} mentioning "${messageIncludes}"`);
    return found;
  });
}

describe("contact request activity log + notification coverage", () => {
  let superAdminAgent;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
  });

  test("full Invoice + payment + close lifecycle logs every staff/customer action", async () => {
    const phone = `0951${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    // Staff sets an invoice.
    await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 1200, currency: "SAR" });
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_INVOICE_SET", contactRequestId);

    // Customer approves it — staff should be logged AND notified.
    await customerAgent.post(`/api/tracking/requests/${contactRequestId}/invoice/approve`);
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_INVOICE_APPROVED", contactRequestId);
    await assertNotified(
      superAdminAgent,
      "CONTACT_REQUEST_INVOICE_APPROVED",
      "Activity Notification Test User"
    );

    // Customer marks the transfer sent — the most operationally important
    // notification: staff need to go verify the bank transfer.
    await customerAgent.post(`/api/tracking/requests/${contactRequestId}/mark-transfer-sent`);
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_TRANSFER_MARKED_SENT", contactRequestId);
    await assertNotified(
      superAdminAgent,
      "CONTACT_REQUEST_TRANSFER_MARKED_SENT",
      "Activity Notification Test User"
    );

    // Staff confirms the payment.
    await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/confirm-payment`);
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_PAYMENT_CONFIRMED", contactRequestId);

    // Staff delivers a file.
    await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/deliverables`)
      .field("label", "التأشيرة الصادرة")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "visa.png",
        contentType: "image/png",
      });
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_DELIVERABLE_UPLOADED", contactRequestId);

    // Staff closes the request with an outcome.
    await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CLOSED", outcome: "COMPLETED" });
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_STATUS_CHANGED", contactRequestId);
  });

  test("Offers path + document upload/review are logged and the customer actor is notified", async () => {
    const phone = `0952${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    const offerRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "Saudia", amount: 1800, currency: "SAR" });
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_OFFER_ADDED", contactRequestId);
    const offerId = offerRes.body.data.id;

    await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/offers/${offerId}/select`
    );
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_OFFER_SELECTED", contactRequestId);
    await assertNotified(
      superAdminAgent,
      "CONTACT_REQUEST_OFFER_SELECTED",
      "Activity Notification Test User"
    );

    const uploadRes = await customerAgent
      .post(`/api/tracking/requests/${contactRequestId}/documents`)
      .field("label", "جواز السفر")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "passport.png",
        contentType: "image/png",
      });
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_DOCUMENT_UPLOADED", contactRequestId);
    await assertNotified(
      superAdminAgent,
      "CONTACT_REQUEST_DOCUMENT_UPLOADED",
      "Activity Notification Test User"
    );

    const documentId = uploadRes.body.data.id;
    await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
      .send({ status: "ACCEPTED" });
    await assertLogged(superAdminAgent, "CONTACT_REQUEST_DOCUMENT_REVIEWED", contactRequestId);
  });
});
