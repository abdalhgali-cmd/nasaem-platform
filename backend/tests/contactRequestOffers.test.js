import "./env.js";
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends 4 of publicContactLimiter's 5 POST /contact-requests (one
// per top-level test) and 2 of request-code's 5/15min/IP (one customer
// login per phone that actually needs one). Carrier creation goes through
// POST /api/carriers, which carries no rate limit (staff-only, matching
// every other authenticated write endpoint in this codebase).
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

describe("contact request offers (multi-carrier priced alternatives)", () => {
  let adminAgent;
  let suffixCounter = 0;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  function nextSuffix() {
    suffixCounter += 1;
    return `${Date.now()}${suffixCounter}`;
  }

  async function createCarrier(mode) {
    const res = await adminAgent.post("/api/carriers").send({ name: `Test Carrier ${nextSuffix()}`, mode });
    assert.equal(res.status, 201);
    return res.body.data.id;
  }

  test("two competing carrier offers: customer sees both, approving one auto-declines the other, and locks further edits", async () => {
    const phone = testPhone();
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Flight Offer Owner",
      phone,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "جدة" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const tarcoId = await createCarrier("AIR");
    const badrId = await createCarrier("AIR");

    const offer1Res = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 500,
      legs: [{ carrierId: tarcoId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(offer1Res.status, 201);
    const offer1Id = offer1Res.body.data.id;

    const offer2Res = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 550,
      legs: [{ carrierId: badrId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(offer2Res.status, 201);
    const offer2Id = offer2Res.body.data.id;

    const customerAgent = await loginAsCustomer(phone);
    const mineRes = await customerAgent.get("/api/contact-requests/mine");
    const row = mineRes.body.data.find((r) => r.id === id);
    assert.equal(row.friendlyStatus.needsOfferApproval, true);
    assert.equal(row.pendingOffers.length, 2);
    const seenCarrierNames = row.pendingOffers.map((o) => o.legs[0].carrier.name).sort();
    assert.deepEqual(seenCarrierNames, [offer1Res.body.data.legs[0].carrier.name, offer2Res.body.data.legs[0].carrier.name].sort());

    const approveRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offer1Id}/approve`);
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(approveRes.body.data.paymentAmount, "500");

    const staffViewRes = await adminAgent.get("/api/contact-requests?limit=50");
    const staffRow = staffViewRes.body.data.find((r) => r.id === id);
    const staffOffer1 = staffRow.offers.find((o) => o.id === offer1Id);
    const staffOffer2 = staffRow.offers.find((o) => o.id === offer2Id);
    assert.equal(staffOffer1.status, "APPROVED");
    assert.equal(staffOffer2.status, "DECLINED");

    // Already approved / already declined — neither can be re-approved.
    const reapproveRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offer1Id}/approve`);
    assert.equal(reapproveRes.status, 400);
    const approveDeclinedRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offer2Id}/approve`);
    assert.equal(approveDeclinedRes.status, 400);

    // The approved offer is locked — no more edits.
    const editApprovedRes = await adminAgent.patch(`/api/contact-requests/${id}/offers/${offer1Id}`).send({
      currency: "SAR",
      amount: 999,
      legs: [{ carrierId: tarcoId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(editApprovedRes.status, 400);

    // A third offer can still be created, edited while pending, and withdrawn.
    const offer3Res = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "USD",
      amount: 200,
      legs: [{ carrierId: tarcoId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(offer3Res.status, 201);
    const offer3Id = offer3Res.body.data.id;

    const editOffer3Res = await adminAgent.patch(`/api/contact-requests/${id}/offers/${offer3Id}`).send({
      currency: "USD",
      amount: 210,
      legs: [{ carrierId: badrId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(editOffer3Res.status, 200);
    assert.equal(editOffer3Res.body.data.amount, "210");
    assert.equal(editOffer3Res.body.data.legs.length, 1);
    assert.equal(editOffer3Res.body.data.legs[0].carrierId, badrId);

    const withdrawRes = await adminAgent.post(`/api/contact-requests/${id}/offers/${offer3Id}/withdraw`);
    assert.equal(withdrawRes.status, 200);
    assert.equal(withdrawRes.body.data.status, "WITHDRAWN");

    const approveWithdrawnRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offer3Id}/approve`);
    assert.equal(approveWithdrawnRes.status, 400);

    const withdrawAgainRes = await adminAgent.post(`/api/contact-requests/${id}/offers/${offer3Id}/withdraw`);
    assert.equal(withdrawAgainRes.status, 400);
  });

  test("a different customer phone cannot approve someone else's offer", async () => {
    const ownerPhone = testPhone();
    const strangerPhone = testPhone();

    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Offer Ownership Owner",
      phone: ownerPhone,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "الرياض" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const carrierId = await createCarrier("AIR");
    const offerRes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 300,
      legs: [{ carrierId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "الرياض" }],
    });
    assert.equal(offerRes.status, 201);
    const offerId = offerRes.body.data.id;

    const strangerAgent = await loginAsCustomer(strangerPhone);
    const forbiddenRes = await strangerAgent.post(`/api/contact-requests/${id}/offers/${offerId}/approve`);
    assert.equal(forbiddenRes.status, 403);

    const unknownOfferRes = await strangerAgent.post(`/api/contact-requests/${id}/offers/does-not-exist/approve`);
    assert.equal(unknownOfferRes.status, 404);
  });

  test("an invalid carrierId is rejected when creating an offer", async () => {
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Invalid Carrier Owner",
      phone: testPhone(),
      service: "طيران",
      details: { من: "الخرطوم", إلى: "الرياض" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const offerRes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 300,
      legs: [{ carrierId: "does-not-exist", direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "الرياض" }],
    });
    assert.equal(offerRes.status, 400);
  });

  test("the same multi-offer mechanism works end-to-end for a ferry request with a single one-way leg", async () => {
    const phone = testPhone();
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Ferry Offer Owner",
      phone,
      service: "حجز العبارات",
      details: { "ميناء الانطلاق": "بورتسودان", "ميناء الوصول": "جدة" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const seaCarrierId = await createCarrier("SEA");
    const offerRes = await adminAgent.post(`/api/contact-requests/${id}/offers`).send({
      currency: "SAR",
      amount: 150,
      legs: [{ carrierId: seaCarrierId, direction: "OUTBOUND", fromLocation: "بورتسودان", toLocation: "جدة" }],
    });
    assert.equal(offerRes.status, 201);
    assert.equal(offerRes.body.data.legs.length, 1);
    const offerId = offerRes.body.data.id;

    const customerAgent = await loginAsCustomer(phone);
    const approveRes = await customerAgent.post(`/api/contact-requests/${id}/offers/${offerId}/approve`);
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(approveRes.body.data.paymentAmount, "150");
  });
});
