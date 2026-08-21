import "./env.js";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Phase 1.5 — "close the loop": auto-completion (payment CONFIRMED + at
// least one deliverable → CLOSED/COMPLETED) and the customer-facing
// WhatsApp notifications added alongside it. Uses the same fetch-mocking
// technique as whatsapp.test.js so no real Meta API call is ever made.
//
// Rate-limit budget: this file creates exactly 5 fresh ContactRequests via
// the public, rate-limited (5/15min) POST /api/contact-requests — the
// maximum this endpoint allows per file/process (see contactRequests.test.js
// and every other contactRequest*.test.js file, which budget the same way).
// Every scenario below is folded into one of these 5 flows rather than
// given its own request.

function mockWhatsApp() {
  process.env.WHATSAPP_API_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
  delete process.env.WHATSAPP_TEMPLATE_NAME;

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, text: async () => "" };
  };

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

async function submitContactRequest(phone, extra = {}) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Auto Completion Test User",
      phone,
      message: "طلب اختبار لإغلاق الدورة تلقائيًا",
      ...extra,
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

function attachPdf(req, filename = "file.pdf") {
  return req.attach("file", Buffer.from("%PDF-1.4 fake pdf bytes"), {
    filename,
    contentType: "application/pdf",
  });
}

function attachPng(req) {
  return req.attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
    filename: "passport.png",
    contentType: "image/png",
  });
}

// Runs a request through invoice -> customer approval -> transfer declared,
// stopping just short of staff confirming it — the shared setup every
// scenario below needs before it can exercise confirmContactRequestPayment
// itself.
async function advanceToAwaitingConfirmation(superAdminAgent, customerAgent, contactRequestId) {
  const invoiceRes = await superAdminAgent
    .post(`/api/contact-requests/${contactRequestId}/invoice`)
    .send({ amount: 500, currency: "SAR" });
  assert.equal(invoiceRes.status, 200, JSON.stringify(invoiceRes.body));

  const approveRes = await customerAgent.post(
    `/api/tracking/requests/${contactRequestId}/invoice/approve`
  );
  assert.equal(approveRes.status, 200, JSON.stringify(approveRes.body));

  const markSentRes = await customerAgent.post(
    `/api/tracking/requests/${contactRequestId}/mark-transfer-sent`
  );
  assert.equal(markSentRes.status, 200, JSON.stringify(markSentRes.body));
}

async function getContactRequest(adminAgent, contactRequestId) {
  const res = await adminAgent.get("/api/contact-requests?limit=50");
  assert.equal(res.status, 200);
  const found = res.body.data.find((r) => r.id === contactRequestId);
  assert.ok(found, `expected ${contactRequestId} in the staff list`);
  return found;
}

describe("auto-completion + customer WhatsApp notifications", () => {
  let superAdminAgent;
  let whatsapp;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
  });

  beforeEach(() => {
    whatsapp = mockWhatsApp();
  });

  afterEach(() => {
    whatsapp.restore();
  });

  // Covers: (1) payment CONFIRMED + no deliverable -> NOT CLOSED,
  // (3)+(5) deliverable exists first, then payment confirmation -> auto
  // CLOSED/COMPLETED, (4) a second deliverable afterward has no duplicate
  // completion side effects.
  test("deliverable first, then payment confirmed: closes exactly once, on the payment-confirm step", async () => {
    const phone = `0940${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    await advanceToAwaitingConfirmation(superAdminAgent, customerAgent, contactRequestId);

    // A deliverable already exists, but payment isn't CONFIRMED yet.
    const deliverableRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "التأشيرة الصادرة")
    );
    assert.equal(deliverableRes.status, 201, JSON.stringify(deliverableRes.body));

    let found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.notEqual(found.status, "CLOSED", "must not close before payment is confirmed (item 1)");

    // Now confirm payment — this is the action that should trigger the
    // auto-close, since the deliverable already exists (item 5).
    const beforeConfirmCalls = whatsapp.calls.length;
    const confirmRes = await superAdminAgent.post(
      `/api/contact-requests/${contactRequestId}/confirm-payment`
    );
    assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body));
    assert.equal(confirmRes.body.data.status, "CLOSED");
    assert.equal(confirmRes.body.data.outcome, "COMPLETED");
    assert.ok(confirmRes.body.data.closedAt);

    const newCalls = whatsapp.calls.slice(beforeConfirmCalls);
    // "payment confirmed" + "your request is complete" — two distinct real
    // events, not a duplicate of the same one.
    assert.equal(newCalls.length, 2, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("تم تأكيد استلام تحويلك"));
    assert.ok(newCalls[1].body.text.body.includes("تم إنجاز طلبك بنجاح"));

    found = await getContactRequest(superAdminAgent, contactRequestId);
    const closedAtFirst = found.closedAt;

    // Item 4: a second deliverable on an already-CLOSED/COMPLETED request
    // must not re-close it, re-set closedAt, or send a second completion
    // notification.
    const beforeSecondDeliverable = whatsapp.calls.length;
    const secondDeliverableRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "تذكرة الطيران"),
      "second.pdf"
    );
    assert.equal(secondDeliverableRes.status, 201);

    found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.equal(found.status, "CLOSED");
    assert.equal(found.outcome, "COMPLETED");
    assert.equal(found.closedAt, closedAtFirst, "closedAt must not change on a second deliverable");

    const secondDeliverableCalls = whatsapp.calls.slice(beforeSecondDeliverable);
    // Only the plain "a new file is ready" notification for the second
    // upload — no second completion message.
    assert.equal(secondDeliverableCalls.length, 1, JSON.stringify(secondDeliverableCalls));
    assert.ok(secondDeliverableCalls[0].body.text.body.includes("أصبح الملف"));
    assert.ok(!secondDeliverableCalls[0].body.text.body.includes("تم إنجاز طلبك بنجاح"));
  });

  // Covers: (2) a deliverable with no payment confirmed at all -> NOT
  // CLOSED, and (11) the deliverable upload itself still sends its own
  // "a file is ready" notification regardless of payment state.
  test("deliverable with no payment confirmation: stays open, still notifies", async () => {
    const phone = `0941${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    const beforeCalls = whatsapp.calls.length;
    const deliverableRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "مستند أولي")
    );
    assert.equal(deliverableRes.status, 201);

    const found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.notEqual(found.status, "CLOSED");
    assert.equal(found.paymentStatus, "NOT_REQUIRED");

    const newCalls = whatsapp.calls.slice(beforeCalls);
    assert.equal(newCalls.length, 1);
    assert.ok(newCalls[0].body.text.body.includes("أصبح الملف"));
  });

  // Covers: (6) payment already CONFIRMED, then a deliverable is uploaded
  // -> auto close fires on the deliverable-upload step this time (the
  // reverse order from the first test above).
  test("payment confirmed first, then deliverable: closes exactly once, on the deliverable-upload step", async () => {
    const phone = `0942${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    await advanceToAwaitingConfirmation(superAdminAgent, customerAgent, contactRequestId);

    const confirmRes = await superAdminAgent.post(
      `/api/contact-requests/${contactRequestId}/confirm-payment`
    );
    assert.equal(confirmRes.status, 200);
    assert.notEqual(confirmRes.body.data.status, "CLOSED", "no deliverable yet — must not close here");

    const beforeDeliverableCalls = whatsapp.calls.length;
    const deliverableRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "التأشيرة الصادرة")
    );
    assert.equal(deliverableRes.status, 201);

    const found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.equal(found.status, "CLOSED");
    assert.equal(found.outcome, "COMPLETED");

    const newCalls = whatsapp.calls.slice(beforeDeliverableCalls);
    assert.equal(newCalls.length, 2, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("أصبح الملف"));
    assert.ok(newCalls[1].body.text.body.includes("تم إنجاز طلبك بنجاح"));
  });

  // Covers: (7) a real status change fires exactly one notification, (8) a
  // no-op status update (same value resubmitted) fires zero, and (12) a
  // WhatsApp send failure never breaks the underlying operation. Also
  // covers (9)+(10): document accepted/rejected each fire one notification
  // attempt, folded into this same request rather than a separate one.
  test("status change dedup, WhatsApp-failure isolation, and document review notifications", async () => {
    const phone = `0943${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    // (7) NEW -> CONTACTED is a real change: exactly one notification.
    let beforeCalls = whatsapp.calls.length;
    const changeRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CONTACTED" });
    assert.equal(changeRes.status, 200);
    let newCalls = whatsapp.calls.slice(beforeCalls);
    assert.equal(newCalls.length, 1, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("تم التواصل معك"));

    // (8) CONTACTED -> CONTACTED (no-op): zero notifications.
    beforeCalls = whatsapp.calls.length;
    const noopRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CONTACTED" });
    assert.equal(noopRes.status, 200);
    newCalls = whatsapp.calls.slice(beforeCalls);
    assert.equal(newCalls.length, 0, JSON.stringify(newCalls));

    // (12) A genuine change, but the WhatsApp API itself fails — the
    // status-change request must still succeed.
    globalThis.fetch = async () => {
      throw new Error("simulated WhatsApp outage");
    };
    const duringOutageRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "NEW" });
    assert.equal(duringOutageRes.status, 200, "the status change itself must not fail");
    assert.equal(duringOutageRes.body.data.status, "NEW");

    // Restore the recording mock for the document-review checks below.
    whatsapp.restore();
    whatsapp = mockWhatsApp();

    const uploadRes = await attachPng(
      customerAgent
        .post(`/api/tracking/requests/${contactRequestId}/documents`)
        .field("label", "جواز السفر")
    );
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));
    const documentId = uploadRes.body.data.id;

    // (9) Accepted -> one notification.
    beforeCalls = whatsapp.calls.length;
    const acceptRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
      .send({ status: "ACCEPTED" });
    assert.equal(acceptRes.status, 200);
    newCalls = whatsapp.calls.slice(beforeCalls);
    assert.equal(newCalls.length, 1, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("تم قبول المستند"));

    // (10) Upload a second document and reject it -> one notification
    // that includes the staff-authored reason.
    const secondUploadRes = await attachPng(
      customerAgent
        .post(`/api/tracking/requests/${contactRequestId}/documents`)
        .field("label", "الصورة الشخصية")
    );
    const secondDocumentId = secondUploadRes.body.data.id;

    beforeCalls = whatsapp.calls.length;
    const rejectRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${secondDocumentId}/status`)
      .send({ status: "REJECTED", reviewNote: "الصورة غير واضحة" });
    assert.equal(rejectRes.status, 200);
    newCalls = whatsapp.calls.slice(beforeCalls);
    assert.equal(newCalls.length, 1, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("تم رفض المستند"));
    assert.ok(newCalls[0].body.text.body.includes("الصورة غير واضحة"));
  });

  // Covers: (13) the customer's own tracking view carries serviceRef,
  // visaType, travelerCount, and intakeData; also re-confirms (14) that a
  // different customer's tracking session never sees this request, using
  // the phone from the previous flow above as the "other customer".
  test("tracking payload carries intake data, and stays scoped to the owning customer", async () => {
    const phone = `0944${uniqueSuffix()}`;

    const catalogRes = await request(app).get("/api/services/public");
    const workVisa = catalogRes.body.data.visaTypes.find((v) => v.code === "VISA-WORK");
    assert.ok(workVisa, "expected the seeded work-visa VisaType to exist");

    const createRes = await request(app)
      .post("/api/contact-requests")
      .field("name", "Auto Completion Intake Test")
      .field("phone", phone)
      .field("service", "تأشيرة العمل")
      .field("message", "طلب تأشيرة عمل لاختبار بيانات التتبع")
      .field("visaTypeId", workVisa.id)
      .field("serviceId", workVisa.serviceId || "")
      .field("travelerCount", "2")
      .field(
        "intakeData",
        JSON.stringify({ travelers: [{ fullName: "Ahmed Ali", passportNo: "P123" }], notes: "ملاحظة اختبار" })
      );
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const contactRequestId = createRes.body.data.id;

    const ownerAgent = await loginTrackingAgent(phone);
    const ownRes = await ownerAgent.get("/api/tracking/requests");
    assert.equal(ownRes.status, 200);
    const own = ownRes.body.data.find((r) => r.id === contactRequestId);
    assert.ok(own, "expected the request in the owner's tracking list");

    assert.equal(own.visaType.name, "تأشيرة العمل");
    assert.equal(own.travelerCount, 2);
    assert.equal(own.intakeData.travelers[0].fullName, "Ahmed Ali");
    assert.equal(own.intakeData.notes, "ملاحظة اختبار");

    // Item 14: a different customer (any other phone) must never see this
    // request in their own tracking list.
    const otherAgent = await loginTrackingAgent(`0945${uniqueSuffix()}`);
    const otherRes = await otherAgent.get("/api/tracking/requests");
    assert.equal(otherRes.status, 200);
    assert.ok(
      !otherRes.body.data.some((r) => r.id === contactRequestId),
      "a different customer must never see another customer's request"
    );
  });
});
