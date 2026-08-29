import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { getSystemActorId } from "../src/utils/systemActor.js";
import { normalizePhone } from "../src/utils/phone.js";

// Bypasses the public POST /api/contact-requests endpoint's rate limiter
// (shared, low-limit, across this whole test file) — sets the same
// phone/phoneNormalized pair that endpoint would, via a direct write.
async function createContactRequestDirect(localPhone) {
  const request = await prisma.contactRequest.create({
    data: {
      name: "Tracking Isolation Test User",
      phone: localPhone,
      phoneNormalized: normalizePhone(localPhone),
      message: "استفسار عن رحلة عمرة",
    },
  });
  return request.id;
}

// Creates the login-code row directly (same shape requestLoginCode would
// create) rather than calling POST /api/tracking/request-code — that
// endpoint's rate limiter (limit: 5 per 15 min, shared across every test in
// this file) is already exhausted by the other tests above by the time
// isolation tests run, and request-code itself isn't what's under test here.
async function loginAsTrackingPhone(localPhone) {
  const phone = normalizePhone(localPhone);
  const code = "135790";
  await prisma.contactRequestLoginCode.create({
    data: { phone, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  const agent = request.agent(app);
  const verifyRes = await agent.post("/api/tracking/verify-code").send({ phone: localPhone, code });
  assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
  return agent;
}

async function submitContactRequest(phone, overrides = {}) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Tracking Test User",
      phone,
      message: "استفسار عن رحلة عمرة",
      ...overrides,
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

describe("contact request tracking (customer WhatsApp-OTP login)", () => {
  test("rejects an unauthenticated request to list tracked requests", async () => {
    const res = await request(app).get("/api/tracking/requests");
    assert.equal(res.status, 401);
  });

  test("rejects verify-code without ever requesting one", async () => {
    const phone = `091${uniqueSuffix()}`;

    const res = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone, code: "123456" });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("full login flow: request code -> verify -> list own requests", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `091${suffix}`;
    const contactRequestId = await submitContactRequest(localPhone);

    const requestRes = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: localPhone });

    assert.equal(requestRes.status, 200);
    assert.equal(requestRes.body.success, true);
    assert.ok(requestRes.body.debugCode, "expected debugCode in NODE_ENV=test");

    const agent = request.agent(app);
    const normalizedPhone = `+249${localPhone.slice(1)}`;

    const wrongCodeRes = await agent
      .post("/api/tracking/verify-code")
      .send({ phone: normalizedPhone, code: "000000" });
    assert.equal(wrongCodeRes.status, 400);

    const verifyRes = await agent
      .post("/api/tracking/verify-code")
      .send({ phone: normalizedPhone, code: requestRes.body.debugCode });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);

    const listRes = await agent.get("/api/tracking/requests");
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.data));
    assert.ok(listRes.body.data.some((r) => r.id === contactRequestId));

    const trackedRequest = listRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(trackedRequest.statusLabel, "تم استلام طلبك وهو قيد المراجعة");
    assert.ok(Array.isArray(trackedRequest.paymentAccounts));
    assert.equal(trackedRequest.paymentCurrency, null);

    const logoutRes = await agent.post("/api/tracking/logout");
    assert.equal(logoutRes.status, 200);

    const afterLogoutRes = await agent.get("/api/tracking/requests");
    assert.equal(afterLogoutRes.status, 401);
  });

  test("a reused (already-consumed) code is rejected", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `092${suffix}`;
    await submitContactRequest(localPhone);

    const requestRes = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: localPhone });
    const code = requestRes.body.debugCode;

    const firstVerify = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: localPhone, code });
    assert.equal(firstVerify.status, 200);

    const secondVerify = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: localPhone, code });
    assert.equal(secondVerify.status, 400);
  });

  test("requesting a new code invalidates the previous one", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `093${suffix}`;

    const firstRequest = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: localPhone });
    const staleCode = firstRequest.body.debugCode;

    await request(app).post("/api/tracking/request-code").send({ phone: localPhone });

    const verifyWithStaleCode = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: localPhone, code: staleCode });

    assert.equal(verifyWithStaleCode.status, 400);
  });

  test("a tracked list only ever contains requests for that phone", async () => {
    const suffixA = uniqueSuffix();
    const suffixB = `${uniqueSuffix()}9`;
    const phoneA = `094${suffixA}`;
    const phoneB = `095${suffixB}`;

    const idA = await submitContactRequest(phoneA);
    await submitContactRequest(phoneB);

    const requestRes = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: phoneA });

    const agent = request.agent(app);
    await agent
      .post("/api/tracking/verify-code")
      .send({ phone: phoneA, code: requestRes.body.debugCode });

    const listRes = await agent.get("/api/tracking/requests");
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.every((r) => r.id !== undefined));
    assert.ok(listRes.body.data.some((r) => r.id === idA));
    assert.equal(listRes.body.data.length, 1, "should only see the request submitted with this exact phone");
  });

  test("validation rejects a malformed code", async () => {
    const res = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: "0912345678", code: "abc" });

    assert.equal(res.status, 400);
  });

  // Egypt Security Approval spec section 12: a customer must never reach
  // another customer's documents, deliverables, invoice, or offers even by
  // guessing/reusing a real contactRequestId — every action here is scoped
  // by findOwnedContactRequest(phoneNormalized, id), not by id alone.
  test("customer A cannot act on customer B's request, invoice, offer, documents or deliverable by guessed id", async () => {
    const suffixA = uniqueSuffix();
    const suffixB = `${uniqueSuffix()}9`;
    const phoneA = `096${suffixA}`;
    const phoneB = `097${suffixB}`;

    await createContactRequestDirect(phoneA);
    const requestBId = await createContactRequestDirect(phoneB);
    const systemActorId = await getSystemActorId();

    const invoiceB = await prisma.invoice.create({
      data: { contactRequestId: requestBId, amount: "500.00", currency: "SDG", createdByUserId: systemActorId },
    });
    const offerB = await prisma.contactRequestOffer.create({
      data: { contactRequestId: requestBId, carrier: "Test Carrier", amount: "500.00", currency: "SDG", createdByUserId: systemActorId },
    });
    const documentB = await prisma.contactRequestDocument.create({
      data: {
        contactRequestId: requestBId,
        label: "صورة الجواز",
        fileName: "b.jpg",
        storagePath: "security-tests/tracking-b.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1,
      },
    });
    const deliverableB = await prisma.contactRequestDeliverable.create({
      data: {
        contactRequestId: requestBId,
        label: "الوثيقة النهائية",
        fileName: "b-final.pdf",
        storagePath: "security-tests/tracking-b-final.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadedByUserId: systemActorId,
      },
    });
    await prisma.contactRequest.update({
      where: { id: requestBId },
      data: { paymentStatus: "AWAITING_TRANSFER" },
    });

    const agentA = await loginAsTrackingPhone(phoneA);

    const aListsRequests = await agentA.get("/api/tracking/requests");
    assert.ok(
      !aListsRequests.body.data.some((r) => r.id === requestBId),
      "customer A's own request list must never include customer B's request"
    );

    const aApprovesInvoice = await agentA.post(`/api/tracking/requests/${requestBId}/invoice/approve`);
    assert.equal(aApprovesInvoice.status, 404, "customer A must not approve customer B's invoice");

    const aRejectsInvoice = await agentA.post(`/api/tracking/requests/${requestBId}/invoice/reject`);
    assert.equal(aRejectsInvoice.status, 404, "customer A must not reject customer B's invoice");

    const aSelectsOffer = await agentA.post(`/api/tracking/requests/${requestBId}/offers/${offerB.id}/select`);
    assert.equal(aSelectsOffer.status, 404, "customer A must not select customer B's offer");

    const aMarksTransfer = await agentA.post(`/api/tracking/requests/${requestBId}/mark-transfer-sent`);
    assert.equal(aMarksTransfer.status, 404, "customer A must not mark customer B's payment as transferred");

    const aDownloadsDocument = await agentA.get(`/api/tracking/requests/${requestBId}/documents/${documentB.id}/file`);
    assert.equal(aDownloadsDocument.status, 404, "customer A must not download customer B's document");

    const aDownloadsDeliverable = await agentA.get(
      `/api/tracking/requests/${requestBId}/deliverables/${deliverableB.id}/file`
    );
    assert.equal(aDownloadsDeliverable.status, 404, "customer A must not download customer B's deliverable");

    // Sanity check: customer B (the actual owner) can still act on their own
    // request, proving the 404s above are isolation, not a broken route.
    const agentB = await loginAsTrackingPhone(phoneB);
    const bApprovesOwnInvoice = await agentB.post(`/api/tracking/requests/${requestBId}/invoice/approve`);
    assert.equal(bApprovesOwnInvoice.status, 200, JSON.stringify(bApprovesOwnInvoice.body));
    assert.equal(invoiceB.contactRequestId, requestBId);
  });
});
