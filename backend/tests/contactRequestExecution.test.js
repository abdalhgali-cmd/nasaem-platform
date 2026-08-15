import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends 2 of publicContactLimiter's 5 POST /contact-requests (one
// FLIGHTS, one UMRAH) and 1 of request-code's 5/15min/IP (the FLIGHTS
// request's invoice needs a real customer approval to reach CONFIRMED
// payment; the UMRAH request deliberately stays a plain NOT_REQUIRED
// inquiry with no quote in flight at all, so it needs no customer login to
// pass the execution-stage "nothing outstanding" gate).
describe("contact request execution stages", () => {
  let adminAgent;
  let flightsId;
  let umrahId;
  let employeeUmrahAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    const flightsRes = await request(app).post("/api/contact-requests").send({
      name: "Execution Stage Flights Owner",
      phone: `09${uniqueSuffix().slice(-6)}05`,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "جدة" },
    });
    assert.equal(flightsRes.status, 201);
    flightsId = flightsRes.body.data.id;

    const umrahRes = await request(app).post("/api/contact-requests").send({
      name: "Execution Stage Umrah Owner",
      phone: `097${uniqueSuffix()}`,
      service: "عمرة",
      details: { "نوع الباقة": "تأشيرة عمرة فقط" },
    });
    assert.equal(umrahRes.status, 201);
    umrahId = umrahRes.body.data.id;

    const employeeEmail = `execution-stage-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const employeePassword = "TestPass@12345";
    const employeeCreateRes = await adminAgent.post("/api/users").send({
      fullName: "Execution Stage UMRAH Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
      department: "UMRAH",
    });
    assert.equal(employeeCreateRes.status, 201);
    employeeUmrahAgent = request.agent(app);
    const loginRes = await employeeUmrahAgent.post("/api/auth/login").send({ email: employeeEmail, password: employeePassword });
    assert.equal(loginRes.status, 200);
  });

  test("unauthenticated and ACCOUNTANT are rejected outright", async () => {
    const unauthRes = await request(app).patch(`/api/contact-requests/${umrahId}/execution-stage`).send({ stage: "IN_PROGRESS" });
    assert.equal(unauthRes.status, 401);

    const accountantEmail = `execution-stage-accountant-${uniqueSuffix()}@nasaem-platform.local`;
    const accountantPassword = "TestPass@12345";
    const createRes = await adminAgent.post("/api/users").send({
      fullName: "Execution Stage Accountant",
      email: accountantEmail,
      password: accountantPassword,
      role: "ACCOUNTANT",
    });
    assert.equal(createRes.status, 201);
    const accountantAgent = request.agent(app);
    await accountantAgent.post("/api/auth/login").send({ email: accountantEmail, password: accountantPassword });
    const accountantRes = await accountantAgent
      .patch(`/api/contact-requests/${umrahId}/execution-stage`)
      .send({ stage: "IN_PROGRESS" });
    assert.equal(accountantRes.status, 403);
  });

  test("an unknown request id 404s", async () => {
    const res = await adminAgent.patch("/api/contact-requests/does-not-exist/execution-stage").send({ stage: "IN_PROGRESS" });
    assert.equal(res.status, 404);
  });

  test("starting execution is blocked while a quote is still pending customer approval", async () => {
    const quoteRes = await adminAgent.patch(`/api/contact-requests/${flightsId}/payment`).send({
      currency: "SAR",
      paymentAmount: 500,
    });
    assert.equal(quoteRes.status, 200);
    // Quoting alone doesn't touch paymentStatus (stays NOT_REQUIRED until
    // the customer approves — see Phase B) — this exercises the gate's
    // pending-invoice branch specifically, not the AWAITING_TRANSFER one.
    assert.equal(quoteRes.body.data.paymentStatus, "NOT_REQUIRED");

    const blockedRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "AWAITING_EXECUTION" });
    assert.equal(blockedRes.status, 400);
  });

  test("full lifecycle: quote -> customer approval -> payment confirmation -> execution stages -> CLOSED outcome", async () => {
    // Recover the flights request's own phone from the staff listing rather
    // than tracking it separately, since createContactRequestSchema doesn't
    // echo the normalized phone back on POST /contact-requests.
    const listRes = await adminAgent.get("/api/contact-requests?limit=100");
    const flightsRow = listRes.body.data.find((r) => r.id === flightsId);
    const phone = flightsRow.phone;

    const codeRes = await request(app).post("/api/customer-auth/request-code").send({ phone });
    assert.equal(codeRes.status, 200);
    const customerAgent = request.agent(app);
    const verifyRes = await customerAgent.post("/api/customer-auth/verify-code").send({
      loginCodeId: codeRes.body.data.loginCodeId,
      code: codeRes.body.data.debugCode,
    });
    assert.equal(verifyRes.status, 200);

    const approveRes = await customerAgent.post(`/api/contact-requests/${flightsId}/invoice/approve`);
    assert.equal(approveRes.status, 200);

    const confirmRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/payment-status`)
      .send({ status: "CONFIRMED" });
    assert.equal(confirmRes.status, 200);

    // Cross-department stage: VISA_ISSUED is not in FLIGHTS' allowed list.
    const crossDeptRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "VISA_ISSUED" });
    assert.equal(crossDeptRes.status, 400);

    const startRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "AWAITING_EXECUTION" });
    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.data.executionStage, "AWAITING_EXECUTION");

    // Re-submitting the same stage is a no-op guard, not a silent success.
    const noopRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "AWAITING_EXECUTION" });
    assert.equal(noopRes.status, 400);

    const bookedRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "TICKETS_BOOKED", notes: "<img src=x onerror=alert(1)>" });
    assert.equal(bookedRes.status, 200);

    const issuedRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "TICKETS_ISSUED" });
    assert.equal(issuedRes.status, 200);

    const deliveredRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "DELIVERED_TO_CUSTOMER" });
    assert.equal(deliveredRes.status, 200);

    // Terminal: no further transitions.
    const afterTerminalRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "CANCELLED" });
    assert.equal(afterTerminalRes.status, 400);

    const staffViewRes = await adminAgent.get("/api/contact-requests?limit=100");
    const row = staffViewRes.body.data.find((r) => r.id === flightsId);
    assert.equal(row.executionStage, "DELIVERED_TO_CUSTOMER");
    assert.equal(row.executionHistory.length, 4);
    // orderBy changedAt desc — most recent (DELIVERED_TO_CUSTOMER) first,
    // the very first transition (oldStage null) last.
    assert.equal(row.executionHistory[0].newStage, "DELIVERED_TO_CUSTOMER");
    assert.equal(row.executionHistory[0].oldStage, "TICKETS_ISSUED");
    assert.equal(row.executionHistory[3].newStage, "AWAITING_EXECUTION");
    assert.equal(row.executionHistory[3].oldStage, null);
    assert.equal(row.executionHistory[0].changedByUser.fullName, "Super Admin");
    // Notes render as literal text elsewhere (dashboard escapeHtml) — here
    // we just confirm the raw payload round-trips unmodified server-side.
    const bookedEntry = row.executionHistory.find((h) => h.newStage === "TICKETS_BOOKED");
    assert.equal(bookedEntry.notes, "<img src=x onerror=alert(1)>");

    const customerMineRes = await customerAgent.get("/api/contact-requests/mine");
    const customerRow = customerMineRes.body.data.find((r) => r.id === flightsId);
    assert.equal(customerRow.friendlyStatus.outcome, "SUCCESS");
    assert.equal(customerRow.friendlyStatus.label, "تم التسليم للعميل");

    const closeRes = await adminAgent.patch(`/api/contact-requests/${flightsId}/status`).send({ status: "CLOSED" });
    assert.equal(closeRes.status, 200);

    const customerAfterCloseRes = await customerAgent.get("/api/contact-requests/mine");
    const customerRowAfterClose = customerAfterCloseRes.body.data.find((r) => r.id === flightsId);
    assert.equal(customerRowAfterClose.friendlyStatus.label, "مكتمل بنجاح");
  });

  test("department scoping: a UMRAH-scoped EMPLOYEE is forbidden on the FLIGHTS request but allowed on the UMRAH one", async () => {
    const forbiddenRes = await employeeUmrahAgent
      .patch(`/api/contact-requests/${flightsId}/execution-stage`)
      .send({ stage: "CANCELLED" });
    assert.equal(forbiddenRes.status, 403);

    // The UMRAH request never had a quote proposed, so paymentStatus stays
    // NOT_REQUIRED with no invoice/offer in flight — a genuinely free
    // inquiry, which the "nothing outstanding" gate must allow through.
    const allowedRes = await employeeUmrahAgent
      .patch(`/api/contact-requests/${umrahId}/execution-stage`)
      .send({ stage: "IN_PROGRESS" });
    assert.equal(allowedRes.status, 200);
    assert.equal(allowedRes.body.data.executionStage, "IN_PROGRESS");
  });
});
