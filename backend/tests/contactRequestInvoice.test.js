import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// The public POST /api/contact-requests endpoint enforces a hard 5-per-window
// rate limit shared across this whole test file's process (see
// contactRequests.test.js's own "rate limiter" test, which budgets the same
// way) — so every test below is written to need at most one fresh
// ContactRequest, keeping this file's total well under that budget. Logging
// in as a *customer* never needs one: request-code/verify-code only touch
// ContactRequestLoginCode, so an "attacker" phone with zero requests of its
// own is free to use for ownership checks.
async function submitContactRequest(phone) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Invoice Test User",
      phone,
      message: "طلب باقة عمرة كاملة",
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

describe("contact request invoice + payment (customer approval flow)", () => {
  let superAdminAgent;
  let accountantAgent;
  let employeeAgent;
  const accountantPassword = "TestPass@12345";
  const employeePassword = "TestPass@12345";

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();

    const accountantEmail = `invoice-accountant-${uniqueSuffix()}@nasaem-platform.local`;
    const createAccountantRes = await superAdminAgent.post("/api/users").send({
      fullName: "Invoice Test Accountant",
      email: accountantEmail,
      password: accountantPassword,
      role: "ACCOUNTANT",
    });
    assert.equal(createAccountantRes.status, 201);

    accountantAgent = request.agent(app);
    const accountantLoginRes = await accountantAgent
      .post("/api/auth/login")
      .send({ email: accountantEmail, password: accountantPassword });
    assert.equal(accountantLoginRes.status, 200);

    const employeeEmail = `invoice-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const createEmployeeRes = await superAdminAgent.post("/api/users").send({
      fullName: "Invoice Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(createEmployeeRes.status, 201);

    employeeAgent = request.agent(app);
    const employeeLoginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email: employeeEmail, password: employeePassword });
    assert.equal(employeeLoginRes.status, 200);
  });

  test("full happy path: quote -> approve -> transfer sent -> confirmed", async () => {
    const phone = `097${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    const createInvoiceRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 1500, currency: "SAR", description: "باقة عمرة 7 أيام" });
    assert.equal(createInvoiceRes.status, 200, JSON.stringify(createInvoiceRes.body));
    assert.equal(createInvoiceRes.body.data.status, "PENDING");
    assert.equal(Number(createInvoiceRes.body.data.amount), 1500);

    const customerAgent = await loginTrackingAgent(phone);

    let tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.invoice.status, "PENDING");
    assert.equal(tracked.paymentStatus, "NOT_REQUIRED");
    assert.equal(tracked.statusLabel, "يوجد عرض سعر بانتظار موافقتك");

    // Marking a transfer sent before the quote is even approved is invalid.
    const earlyMarkSentRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/mark-transfer-sent`
    );
    assert.equal(earlyMarkSentRes.status, 409);

    const approveRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/approve`
    );
    assert.equal(approveRes.status, 200, JSON.stringify(approveRes.body));

    tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.invoice.status, "APPROVED");
    assert.equal(tracked.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(tracked.statusLabel, "تمت الموافقة على السعر، بانتظار تحويل المبلغ");

    // Approving an already-approved invoice again is invalid, not a no-op.
    const doubleApproveRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/approve`
    );
    assert.equal(doubleApproveRes.status, 409);

    // Staff can no longer touch the price once approved.
    const reissueAfterApprovalRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 2000, currency: "SAR" });
    assert.equal(reissueAfterApprovalRes.status, 409);

    const markSentRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/mark-transfer-sent`
    );
    assert.equal(markSentRes.status, 200);

    tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.paymentStatus, "UNDER_REVIEW");
    assert.equal(tracked.statusLabel, "بانتظار مراجعة إثبات التحويل");

    // EMPLOYEE is allowed to quote, but not to confirm a payment.
    const employeeConfirmRes = await employeeAgent.post(
      `/api/contact-requests/${contactRequestId}/confirm-payment`
    );
    assert.equal(employeeConfirmRes.status, 403);

    const confirmRes = await accountantAgent.post(
      `/api/contact-requests/${contactRequestId}/confirm-payment`
    );
    assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body));
    assert.equal(confirmRes.body.data.paymentStatus, "CONFIRMED");
    assert.ok(confirmRes.body.data.paymentConfirmedAt);

    tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.paymentStatus, "CONFIRMED");
    assert.equal(tracked.statusLabel, "تم تأكيد الدفع، جارٍ تنفيذ طلبك");

    // Confirming an already-confirmed payment is rejected, not a silent no-op.
    const doubleConfirmRes = await accountantAgent.post(
      `/api/contact-requests/${contactRequestId}/confirm-payment`
    );
    assert.equal(doubleConfirmRes.status, 409);
  });

  test("rejection flow: customer rejects, staff reissues, customer approves the new quote", async () => {
    const phone = `098${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 900, currency: "SAR" });

    const customerAgent = await loginTrackingAgent(phone);

    const rejectRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/reject`
    );
    assert.equal(rejectRes.status, 200);

    let tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.invoice.status, "REJECTED");
    assert.equal(tracked.statusLabel, "تم رفض عرض السعر، بانتظار عرض جديد من فريقنا");

    // Rejecting again (already REJECTED, no longer PENDING) is invalid.
    const rejectAgainRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/reject`
    );
    assert.equal(rejectAgainRes.status, 409);

    const reissueRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 700, currency: "SAR" });
    assert.equal(reissueRes.status, 200);
    assert.equal(reissueRes.body.data.status, "PENDING");
    assert.equal(Number(reissueRes.body.data.amount), 700);

    const approveRes = await customerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/approve`
    );
    assert.equal(approveRes.status, 200);

    tracked = await fetchTracked(customerAgent, contactRequestId);
    assert.equal(tracked.invoice.status, "APPROVED");
    assert.equal(Number(tracked.invoice.amount), 700);
  });

  test("invoice validation, ownership, and auth guards", async () => {
    const phone = `099${uniqueSuffix()}`;
    const contactRequestId = await submitContactRequest(phone);

    // Rejects a non-positive amount before ever touching the database.
    const invalidAmountRes = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 0, currency: "SAR" });
    assert.equal(invalidAmountRes.status, 400);

    // Quoting a request that doesn't exist is a 404, not a crash.
    const missingRequestRes = await superAdminAgent
      .post("/api/contact-requests/does-not-exist/invoice")
      .send({ amount: 100, currency: "SAR" });
    assert.equal(missingRequestRes.status, 404);

    // Unauthenticated callers can't act on any invoice at all.
    const unauthedRes = await request(app).post(
      `/api/tracking/requests/${contactRequestId}/invoice/approve`
    );
    assert.equal(unauthedRes.status, 401);

    // Before a quote exists, the customer's own view has no invoice and
    // falls back to the plain request-status label.
    const ownerAgent = await loginTrackingAgent(phone);
    let tracked = await fetchTracked(ownerAgent, contactRequestId);
    assert.equal(tracked.invoice, null);
    assert.equal(tracked.paymentStatus, "NOT_REQUIRED");
    assert.equal(tracked.statusLabel, "تم استلام طلبك وهو قيد المراجعة");

    await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/invoice`)
      .send({ amount: 500, currency: "SAR" });

    // A different, unrelated customer (zero contact requests of their own —
    // logging in never requires one) can't approve someone else's invoice.
    const attackerAgent = await loginTrackingAgent(`0910${uniqueSuffix()}`);
    const crossOwnerApproveRes = await attackerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/approve`
    );
    assert.equal(crossOwnerApproveRes.status, 404);

    // The rightful owner can.
    const approveRes = await ownerAgent.post(
      `/api/tracking/requests/${contactRequestId}/invoice/approve`
    );
    assert.equal(approveRes.status, 200);
  });
});
