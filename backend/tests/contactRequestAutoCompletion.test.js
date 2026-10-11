import "./env.js";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// Phase 1.5 — "close the loop": auto-completion (now: payment CONFIRMED +
// recorded execution + the final file PUBLISHED → CLOSED/COMPLETED; see
// workflow-policy.js completionBlockers) and the customer-facing
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
  // Submission now also sends the customer a "request received" WhatsApp
  // confirmation in the background (customer-messages). Let it settle so
  // the per-step message counts below only see the step under test.
  await waitForConfirmation(res.body.data.id);
  return res.body.data.id;
}

async function waitForConfirmation(contactRequestId) {
  for (let i = 0; i < 50; i += 1) {
    const row = await prisma.customerMessageDelivery.findFirst({ where: { contactRequestId } });
    if (row && row.status !== "PENDING" && row.status !== "SENDING") return row;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("request confirmation did not settle");
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

  // Completion policy (workflow-policy.js): payment accepted, execution
  // recorded and the final file PUBLISHED. A file uploaded earlier is only a
  // draft: never announced, never completing anything. Covers: (1) payment
  // CONFIRMED + draft -> NOT CLOSED, (3)+(5) publishing the prepared file
  // after execution -> auto CLOSED/COMPLETED exactly once, (4) a closed
  // request takes no further final file and sends nothing more.
  test("draft first, then payment, execution and publish: closes exactly once, on the publish step", async () => {
    const phone = `0940${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    await advanceToAwaitingConfirmation(superAdminAgent, customerAgent, contactRequestId);

    // The file is prepared before payment: a draft, not announced.
    let beforeCalls = whatsapp.calls.length;
    const draftRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "التأشيرة الصادرة")
    );
    assert.equal(draftRes.status, 201, JSON.stringify(draftRes.body));
    assert.equal(draftRes.body.data.publishedAt, null);
    assert.equal(whatsapp.calls.length - beforeCalls, 0, "a draft is never announced");

    let found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.notEqual(found.status, "CLOSED", "must not close before payment is confirmed (item 1)");

    // Payment confirmed: still open (execution not recorded, file not published).
    beforeCalls = whatsapp.calls.length;
    const confirmRes = await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/confirm-payment`);
    assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body));
    assert.notEqual(confirmRes.body.data.status, "CLOSED", "payment + draft is not completion");
    let newCalls = whatsapp.calls.slice(beforeCalls);
    assert.equal(newCalls.length, 1, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("تم تأكيد استلام تحويلك"));

    assert.equal((await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/start-execution`).send({})).status, 200);

    // Publishing the prepared file is the step that completes the request.
    beforeCalls = whatsapp.calls.length;
    const publishRes = await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/deliverables/${draftRes.body.data.id}/publish`).send({});
    assert.equal(publishRes.status, 200, JSON.stringify(publishRes.body));
    assert.equal(publishRes.body.completed, true);
    newCalls = whatsapp.calls.slice(beforeCalls);
    // "your file is ready" + "your request is complete" — two distinct real
    // events, not a duplicate of the same one.
    assert.equal(newCalls.length, 2, JSON.stringify(newCalls));
    assert.ok(newCalls[0].body.text.body.includes("أصبح الملف"));
    assert.ok(newCalls[1].body.text.body.includes("تم إنجاز طلبك بنجاح"));

    found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.equal(found.status, "CLOSED");
    assert.equal(found.outcome, "COMPLETED");
    const closedAtFirst = found.closedAt;

    // Item 4: the closed request is read-only: a further final file is
    // refused, closedAt does not move, nothing is sent.
    beforeCalls = whatsapp.calls.length;
    const secondDeliverableRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "تذكرة الطيران"),
      "second.pdf"
    );
    assert.equal(secondDeliverableRes.status, 409);
    found = await getContactRequest(superAdminAgent, contactRequestId);
    assert.equal(found.closedAt, closedAtFirst, "closedAt must not change");
    assert.equal(whatsapp.calls.length - beforeCalls, 0);
  });

  // Covers: (2) a file with no payment confirmed at all -> NOT CLOSED, and
  // (11) a prepared file is not announced: nothing is ready for the customer.
  test("deliverable with no payment confirmation: stays open as a draft, not announced", async () => {
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
    assert.equal(whatsapp.calls.length - beforeCalls, 0, "a draft is never announced");

    const published = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "مستند أولي")
        .field("publish", "true")
    );
    assert.equal(published.status, 409, "publishing needs an accepted payment and a recorded execution");
  });

  // Covers: (6) payment already CONFIRMED, then a file uploaded and published
  // in one step -> refused until execution is recorded, then the auto close
  // fires on that upload exactly once.
  test("payment confirmed first, then execution, then a published file: closes exactly once, on the upload step", async () => {
    const phone = `0942${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);
    const customerAgent = await loginTrackingAgent(phone);

    await advanceToAwaitingConfirmation(superAdminAgent, customerAgent, contactRequestId);

    const confirmRes = await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/confirm-payment`);
    assert.equal(confirmRes.status, 200);
    assert.notEqual(confirmRes.body.data.status, "CLOSED", "no deliverable yet — must not close here");

    const early = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "التأشيرة الصادرة")
        .field("publish", "true")
    );
    assert.equal(early.status, 409, "publishing before the recorded start of execution is refused");
    assert.equal((await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/start-execution`).send({})).status, 200);

    const beforeDeliverableCalls = whatsapp.calls.length;
    const deliverableRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "التأشيرة الصادرة")
        .field("publish", "true")
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
  // attempt — done while the request is open (a closed request takes no
  // new documents or reviews).
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

    // (12) A genuine change, but the WhatsApp API itself fails — the
    // status-change request must still succeed.
    globalThis.fetch = async () => {
      throw new Error("simulated WhatsApp outage");
    };
    // (CONTACTED -> NEW is not an allowed transition; closing is.)
    const duringOutageRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/status`)
      .send({ status: "CLOSED", outcome: "CANCELLED" });
    assert.equal(duringOutageRes.status, 200, "the status change itself must not fail");
    assert.equal(duringOutageRes.body.data.status, "CLOSED");
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
