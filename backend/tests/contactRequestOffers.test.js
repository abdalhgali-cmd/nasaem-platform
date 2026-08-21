import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Only three fresh ContactRequests are created in this whole file — the
// public POST /api/contact-requests endpoint enforces a hard 5-per-window
// rate limit shared across this file's process (see contactRequests.test.js
// and contactRequestInvoice.test.js, which budget the same way).
async function submitContactRequest(phone) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Offer Test User",
      phone,
      service: "حجز طيران",
      message: "أريد مقارنة أسعار عدة شركات طيران",
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

async function fetchTracked(agent, contactRequestId) {
  const res = await agent.get("/api/tracking/requests");
  assert.equal(res.status, 200);
  return res.body.data.find((r) => r.id === contactRequestId);
}

describe("contact request multi-carrier offers", () => {
  let superAdminAgent;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
  });

  test("full flow: multiple offers -> customer selects one -> transfer -> confirmed", async () => {
    const phone = `0921${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    const offerARes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "Saudia", amount: 1800, currency: "SAR", description: "رحلة مباشرة" });
    assert.equal(offerARes.status, 201, JSON.stringify(offerARes.body));
    assert.equal(offerARes.body.data.carrier, "Saudia");

    const offerBRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "flynas", amount: 1500, currency: "SAR", description: "توقف واحد" });
    assert.equal(offerBRes.status, 201);
    const offerBId = offerBRes.body.data.id;

    // Adding an invoice to a request that already has offers is refused —
    // a request uses one pricing mechanism or the other, never both.
    const invoiceOnOfferedRequestRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 1000, currency: "SAR" });
    assert.equal(invoiceOnOfferedRequestRes.status, 409);

    const customerAgent = await loginTrackingAgent(phone);

    let tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.offers.length, 2);
    assert.equal(tracked.paymentStatus, "NOT_REQUIRED");
    assert.equal(tracked.statusLabel, "توجد عروض أسعار متعددة بانتظار اختيارك");

    const selectRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/offers/${offerBId}/select`
    );
    assert.equal(selectRes.status, 200, JSON.stringify(selectRes.body));

    tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.selectedOfferId, offerBId);
    assert.equal(tracked.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(tracked.statusLabel, "تمت الموافقة على السعر، بانتظار تحويل المبلغ");

    // Selecting a second time is invalid, not a silent no-op.
    const selectAgainRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/offers/${offerARes.body.data.id}/select`
    );
    assert.equal(selectAgainRes.status, 409);

    // Staff can no longer add offers once one has been selected.
    const lateOfferRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "Qatar Airways", amount: 2000, currency: "SAR" });
    assert.equal(lateOfferRes.status, 409);

    // The rest of the payment flow is identical to the Invoice path (same
    // paymentStatus state machine, unaware of which pricing mechanism fed
    // it) — spot-check it still works end to end.
    const markSentRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/mark-transfer-sent`
    );
    assert.equal(markSentRes.status, 200);

    const confirmRes = await superAdminAgent.post(
      `/api/contact-requests/${contactRequestId}/confirm-payment`
    );
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.paymentStatus, "CONFIRMED");

    tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.statusLabel, "تم تأكيد الدفع، جارٍ تنفيذ طلبك");
  });

  test("mutual exclusivity, ownership, and not-found guards", async () => {
    const phone = `0922${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    // Rejects a non-positive amount.
    const invalidRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "Saudia", amount: 0, currency: "SAR" });
    assert.equal(invalidRes.status, 400);

    // Quoting an invoice first...
    await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 900, currency: "SAR" });

    // ...then blocks adding a multi-carrier offer to the same request.
    const offerAfterInvoiceRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "Saudia", amount: 1800, currency: "SAR" });
    assert.equal(offerAfterInvoiceRes.status, 409);

    // Selecting a nonexistent offer 404s rather than crashing.
    const ownerAgent = await loginTrackingAgent(phone);
    const missingOfferRes = await ownerAgent.post(
      `/api/tracking/requests/${contactRequestId}/offers/does-not-exist/select`
    );
    assert.equal(missingOfferRes.status, 404);

    // Unrelated customer can't select on someone else's request either.
    const attackerAgent = await loginTrackingAgent(`0923${uniqueSuffix()}`);
    const crossOwnerRes = await attackerAgent.post(
      `/api/tracking/requests/${contactRequestId}/offers/does-not-exist/select`
    );
    assert.equal(crossOwnerRes.status, 404);
  });

  test("manual flight offer: structured details reach the customer, internalNotes never does, and an expired offer can't be selected", async () => {
    const phone = `0924${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    const flightDetails = {
      flightNumber: "SV1234",
      origin: "الرياض",
      destination: "جدة",
      departureDate: "2026-09-01",
      departureTime: "10:30",
      stops: 0,
      cabinClass: "اقتصادية",
    };

    const liveOfferRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({
        carrier: "Saudia",
        amount: 1200,
        currency: "SAR",
        flightDetails,
        internalNotes: "سعر خاص عبر مورد محلي",
      });
    assert.equal(liveOfferRes.status, 201, JSON.stringify(liveOfferRes.body));
    assert.equal(liveOfferRes.body.data.source, "MANUAL");
    assert.equal(liveOfferRes.body.data.internalNotes, "سعر خاص عبر مورد محلي");
    assert.deepEqual(liveOfferRes.body.data.flightDetails, flightDetails);

    const expiredOfferRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/offers`)
      .send({ carrier: "flynas", amount: 900, currency: "SAR", validUntil: "2020-01-01" });
    assert.equal(expiredOfferRes.status, 201);
    const expiredOfferId = expiredOfferRes.body.data.id;

    const customerAgent = await loginTrackingAgent(phone);
    const tracked = await fetchTracked(customerAgent, contactRequestId);

    const liveOfferAsSeenByCustomer = tracked.offers.find((o) => o.carrier === "Saudia");
    assert.deepEqual(liveOfferAsSeenByCustomer.flightDetails, flightDetails);
    assert.equal(
      "internalNotes" in liveOfferAsSeenByCustomer,
      false,
      "internalNotes must never reach the tracking API"
    );

    // A staff-set expiry in the past blocks selection, not just display.
    const selectExpiredRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/offers/${expiredOfferId}/select`
    );
    assert.equal(selectExpiredRes.status, 409);
  });
});
