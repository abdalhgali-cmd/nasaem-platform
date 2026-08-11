import "./env.js";
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends 5 of publicContactLimiter's 5 POST /contact-requests
// (one per test that needs a real request to quote/offer — no other test
// in this file may call POST /contact-requests) and 5 of request-code's
// 5/15min/IP (one customer login per phone that actually needs one —
// tests reusing an already-authenticated agent don't spend more).
let phoneCounter = 0;
function testPhone() {
  phoneCounter += 1;
  return `09${String(Date.now()).slice(-6)}${String(phoneCounter).padStart(2, "0")}`;
}

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

describe("invoice quote + customer approval", () => {
  let adminAgent;
  let carrierCounter = 0;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  async function createCarrier() {
    carrierCounter += 1;
    const res = await adminAgent
      .post("/api/carriers")
      .send({ name: `Invoice Conflict Carrier ${Date.now()}${carrierCounter}`, mode: "AIR" });
    assert.equal(res.status, 201);
    return res.body.data.id;
  }

  test("staff's quote does not start the payment flow; only the customer's approval does", async () => {
    const phone = testPhone();
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Quote Flow Owner",
      phone,
      service: "تأشيرة",
      details: { "نوع التأشيرة": "تأشيرة العمل" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const quoteRes = await adminAgent.patch(`/api/contact-requests/${id}/payment`).send({
      currency: "SAR",
      paymentAmount: 600,
    });
    assert.equal(quoteRes.status, 200);
    assert.equal(quoteRes.body.invoice.status, "PENDING_APPROVAL");
    // The behavior change this test pins down: quoting alone must not touch
    // paymentStatus — the customer hasn't agreed to anything yet.
    assert.equal(quoteRes.body.data.paymentStatus, "NOT_REQUIRED");

    // Revising the quote before approval is allowed (upsert, not a new row).
    const revisedQuoteRes = await adminAgent.patch(`/api/contact-requests/${id}/payment`).send({
      currency: "SAR",
      paymentAmount: 750,
    });
    assert.equal(revisedQuoteRes.status, 200);

    const customerAgent = await loginAsCustomer(phone);

    const mineBeforeApproval = await customerAgent.get("/api/contact-requests/mine");
    const beforeRow = mineBeforeApproval.body.data.find((r) => r.id === id);
    assert.equal(beforeRow.friendlyStatus.needsInvoiceApproval, true);
    assert.equal(beforeRow.pendingInvoice.amount, "750");

    const approveRes = await customerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(approveRes.body.data.paymentAmount, "750");

    const staffViewRes = await adminAgent.get("/api/contact-requests?limit=50");
    const approvedRow = staffViewRes.body.data.find((r) => r.id === id);
    assert.equal(approvedRow.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(approvedRow.invoice.status, "APPROVED");

    // Already approved — must not silently re-approve or re-quote.
    const reapproveRes = await customerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
    assert.equal(reapproveRes.status, 400);

    const requoteAfterApprovalRes = await adminAgent.patch(`/api/contact-requests/${id}/payment`).send({
      currency: "SAR",
      paymentAmount: 900,
    });
    assert.equal(requoteAfterApprovalRes.status, 400);
  });

  test("a different customer phone cannot approve someone else's quote", async () => {
    const ownerPhone = testPhone();
    const strangerPhone = testPhone();

    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Ownership Check Owner",
      phone: ownerPhone,
      service: "تأشيرة",
      details: { "نوع التأشيرة": "التأشيرات الدولية" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const quoteRes = await adminAgent.patch(`/api/contact-requests/${id}/payment`).send({
      currency: "SAR",
      paymentAmount: 400,
    });
    assert.equal(quoteRes.status, 200);

    const strangerAgent = await loginAsCustomer(strangerPhone);
    const forbiddenRes = await strangerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
    assert.equal(forbiddenRes.status, 403);

    // A request with no quote at all (or an unknown id) 404s regardless of
    // whose session is calling — reuse the stranger's already-authenticated
    // session rather than spending another request-code call.
    const noQuoteRes = await strangerAgent.post("/api/contact-requests/does-not-exist/invoice/approve");
    assert.equal(noQuoteRes.status, 404);
  });

  // Regression tests for a bug-audit finding: a request should only ever be
  // priced through one mechanism (Invoice or ContactRequestOffer), but
  // neither approval path used to check the other before overwriting
  // paymentAmount/currency/paymentStatus.
  test("approving an offer is blocked once the request's invoice is already approved", async () => {
    const phone = testPhone();
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Invoice-Then-Offer Owner",
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

    // Nothing stops staff from also creating a competing offer while the
    // invoice is still pending — that's the actual precondition for the bug.
    const carrierId = await createCarrier();
    const offerRes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 550,
      legs: [{ carrierId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(offerRes.status, 201);
    const offerId = offerRes.body.data.id;

    const customerAgent = await loginAsCustomer(phone);
    const approveInvoiceRes = await customerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
    assert.equal(approveInvoiceRes.status, 200);
    assert.equal(approveInvoiceRes.body.data.paymentAmount, "500");

    // The still-pending offer must not be approvable now — it would
    // silently overwrite the already-approved invoice's price.
    const approveOfferRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offerId}/approve`);
    assert.equal(approveOfferRes.status, 400);

    // paymentAmount must still reflect the invoice, not the blocked offer.
    const staffViewRes = await adminAgent.get(`/api/contact-requests?limit=50`);
    const row = staffViewRes.body.data.find((r) => r.id === id);
    assert.equal(row.paymentAmount, "500");
  });

  test("approving an invoice is blocked once the request's offer is already approved", async () => {
    const phone = testPhone();
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Offer-Then-Invoice Owner",
      phone,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "الرياض" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const quoteRes = await adminAgent.patch(`/api/contact-requests/${id}/payment`).send({
      currency: "SAR",
      paymentAmount: 300,
    });
    assert.equal(quoteRes.status, 200);

    const carrierId = await createCarrier();
    const offerRes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 350,
      legs: [{ carrierId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "الرياض" }],
    });
    assert.equal(offerRes.status, 201);
    const offerId = offerRes.body.data.id;

    const customerAgent = await loginAsCustomer(phone);
    const approveOfferRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offerId}/approve`);
    assert.equal(approveOfferRes.status, 200);
    assert.equal(approveOfferRes.body.data.paymentAmount, "350");

    // The still-pending invoice must not be approvable now.
    const approveInvoiceRes = await customerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
    assert.equal(approveInvoiceRes.status, 400);

    const staffViewRes = await adminAgent.get(`/api/contact-requests?limit=50`);
    const row = staffViewRes.body.data.find((r) => r.id === id);
    assert.equal(row.paymentAmount, "350");
  });

  test("concurrently approving two different pending offers on the same request leaves exactly one approved", async () => {
    const phone = testPhone();
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Concurrent Approval Owner",
      phone,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "دبي" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const carrierAId = await createCarrier();
    const carrierBId = await createCarrier();

    const offerARes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 400,
      legs: [{ carrierId: carrierAId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "دبي" }],
    });
    assert.equal(offerARes.status, 201);
    const offerAId = offerARes.body.data.id;

    const offerBRes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 450,
      legs: [{ carrierId: carrierBId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "دبي" }],
    });
    assert.equal(offerBRes.status, 201);
    const offerBId = offerBRes.body.data.id;

    const customerAgent = await loginAsCustomer(phone);

    const [resA, resB] = await Promise.all([
      customerAgent.post(`/api/contact-requests/${id}/offers/${offerAId}/approve`),
      customerAgent.post(`/api/contact-requests/${id}/offers/${offerBId}/approve`),
    ]);

    // Exactly one of the two concurrent approvals must win.
    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 400]);

    const staffViewRes = await adminAgent.get(`/api/contact-requests?limit=50`);
    const row = staffViewRes.body.data.find((r) => r.id === id);
    const offerStatuses = row.offers.map((o) => o.status).sort();
    assert.deepEqual(offerStatuses, ["APPROVED", "DECLINED"]);
  });
});
