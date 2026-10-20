import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone } from "./helpers/workflow.js";
import { hashPaymentAccessToken } from "../src/modules/contact-request-payment-access/payment-access.service.js";

// The payment step right after submission: a request created at an accepted
// fixed price returns a request-scoped token that shows the amount and the
// agency's account in that currency and accepts the transfer receipt. The
// receipt only puts the payment under review; an authorised staff member
// confirms it. Nothing else about the request opens with the token.

let admin;
let accountant;
let employee;
let account;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  const created = await admin.post("/api/payment-accounts").send({
    name: `TEST-WF حساب ${uniqueSuffix()}`,
    bankName: "TEST-WF Bank",
    accountName: "TEST-WF Holder",
    accountNumber: `9${uniqueSuffix().slice(-9)}`,
    currency: "USD",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  account = created.body.data;
});

async function visa(pricing) {
  const created = await admin.post("/api/visa-types").send({
    code: `TEST-WF-PA-${uniqueSuffix()}`,
    name: "TEST-WF تأشيرة دفع مباشر",
    country: "TEST",
    basePrice: 200,
    currency: "USD",
    active: true,
    ...pricing,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data;
}

function submit({ phone, visaType, acceptedTotal, acceptedCurrency, submissionKey }) {
  let req = request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-WF عميل")
    .field("phone", phone)
    .field("message", "TEST-WF طلب")
    .field("visaTypeId", visaType.id)
    .field("travelerCount", "1");
  if (acceptedTotal !== undefined) req = req.field("acceptedTotal", String(acceptedTotal)).field("acceptedCurrency", acceptedCurrency);
  if (submissionKey) req = req.field("submissionKey", submissionKey);
  return req;
}

const access = (id, token) => request(app).get(`/api/contact-requests/${id}/payment-access`).set("X-Payment-Access", token);
const uploadWith = (id, token) =>
  request(app)
    .post(`/api/contact-requests/${id}/payment-access/receipt`)
    .set("X-Payment-Access", token)
    .attach("file", PDF(), { filename: "transfer.pdf", contentType: "application/pdf" });

describe("payment straight after submission", () => {
  test("fixed price: account details, receipt → under review (not paid), staff confirm, all audited", async () => {
    const visaType = await visa({ pricingMode: "FIXED" });
    const phone = testPhone();
    const created = await submit({ phone, visaType, acceptedTotal: "200.00", acceptedCurrency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id, paymentAccess } = created.body.data;
    assert.ok(paymentAccess?.token, "a fixed-price request goes straight to payment");
    assert.ok(new Date(paymentAccess.expiresAt) > new Date());

    const stored = await prisma.contactRequest.findUnique({ where: { id }, select: { paymentAccessTokenHash: true } });
    assert.equal(stored.paymentAccessTokenHash, hashPaymentAccessToken(paymentAccess.token), "only the hash is stored");
    assert.notEqual(stored.paymentAccessTokenHash, paymentAccess.token);

    const summary = await access(id, paymentAccess.token);
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(summary.body.data.amount, "200");
    assert.equal(summary.body.data.currency, "USD");
    assert.equal(summary.body.data.visaTypeCode, visaType.code, "payment summary identifies the original service without revealing documents");
    assert.equal(summary.body.data.paymentOpen, true);
    assert.equal(summary.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.ok(summary.body.data.accounts.some((row) => row.id === account.id && row.accountNumber === account.accountNumber));
    assert.ok(summary.body.data.accounts.every((row) => row.currency === "USD"), "only the request's currency");

    const uploaded = await uploadWith(id, paymentAccess.token);
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.data.request.paymentStatus, "UNDER_REVIEW");
    assert.equal(uploaded.body.data.request.paymentStatusLabel, "بانتظار مراجعة الدفع");
    assert.equal(uploaded.body.data.request.paymentOpen, false, "no second receipt while one is under review");
    assert.deepEqual(uploaded.body.data.request.accounts, []);

    const afterUpload = await prisma.contactRequest.findUnique({ where: { id }, include: { documents: true } });
    assert.equal(afterUpload.paymentStatus, "UNDER_REVIEW", "a receipt is never a payment");
    assert.equal(afterUpload.paymentConfirmedAt, null);
    assert.ok(afterUpload.documents.some((d) => d.classification === "FINANCIAL_DOCUMENT"));

    const again = await uploadWith(id, paymentAccess.token);
    assert.equal(again.status, 409, "the workflow policy still decides");

    const staffNotice = await prisma.notification.findFirst({ where: { contactRequestId: id, type: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED" } });
    assert.ok(staffNotice, "staff are notified, linked to the request");

    assert.equal((await employee.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 403, "only an authorised role confirms");
    const confirmed = await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({});
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const final = await access(id, paymentAccess.token);
    assert.equal(final.body.data.paymentStatus, "CONFIRMED");
    assert.equal(final.body.data.paymentStatusLabel, "تم تأكيد السداد");

    const audit = await prisma.activityLog.findMany({ where: { entityId: id }, select: { action: true, newValue: true } });
    const receiptAudit = audit.find((row) => row.action === "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED");
    assert.ok(receiptAudit, "receipt upload is audited");
    assert.equal(receiptAudit.newValue.paymentStatus, "UNDER_REVIEW");
    assert.equal(receiptAudit.newValue.currency, "USD");
    assert.ok(audit.some((row) => /PAYMENT_CONFIRMED/.test(row.action)), JSON.stringify(audit.map((row) => row.action)));
  });

  test("a rejected receipt reopens the payment on the same link with the reason; a new receipt goes back under review", async () => {
    const visaType = await visa({ pricingMode: "FIXED" });
    const created = await submit({ phone: testPhone(), visaType, acceptedTotal: "200.00", acceptedCurrency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id, paymentAccess } = created.body.data;
    assert.equal((await uploadWith(id, paymentAccess.token)).status, 201);

    assert.equal((await employee.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "TEST-WF المبلغ غير مطابق" })).status, 403, "only finance rejects");
    const rejected = await accountant.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "TEST-WF المبلغ غير مطابق" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));

    const reopened = await access(id, paymentAccess.token);
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(reopened.body.data.paymentOpen, true);
    assert.equal(reopened.body.data.rejectionReason, "TEST-WF المبلغ غير مطابق");
    assert.ok(reopened.body.data.accounts.some((row) => row.id === account.id), "the account is shown again");

    const again = await uploadWith(id, paymentAccess.token);
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.data.request.paymentStatus, "UNDER_REVIEW");
    assert.equal(again.body.data.request.rejectionReason, null, "the old reason is cleared");
    const stored = await prisma.contactRequest.findUnique({ where: { id }, include: { documents: true } });
    assert.equal(stored.paymentStatus, "UNDER_REVIEW");
    assert.equal(stored.paymentConfirmedAt, null, "never paid by a receipt");
    const receipts = stored.documents.filter((d) => d.classification === "FINANCIAL_DOCUMENT");
    assert.equal(receipts.length, 2);
    assert.equal(receipts.filter((d) => d.status === "REJECTED").length, 1, "the first receipt stays recorded as rejected");
  });

  test("the token opens only its own request; wrong, missing or expired tokens are refused", async () => {
    const visaType = await visa({ pricingMode: "FIXED" });
    const first = await submit({ phone: testPhone(), visaType, acceptedTotal: "200.00", acceptedCurrency: "USD" });
    const second = await submit({ phone: testPhone(), visaType, acceptedTotal: "200.00", acceptedCurrency: "USD" });
    const a = first.body.data;
    const b = second.body.data;

    assert.equal((await access(b.id, a.paymentAccess.token)).status, 404, "another request's token");
    assert.equal((await uploadWith(b.id, a.paymentAccess.token)).status, 404);
    assert.equal((await request(app).get(`/api/contact-requests/${a.id}/payment-access`)).status, 404, "no token");
    assert.equal((await access(a.id, "x".repeat(43))).status, 404, "wrong token");
    assert.equal((await access(a.id, "short")).status, 404, "malformed token");

    await prisma.contactRequest.update({ where: { id: a.id }, data: { paymentAccessExpiresAt: new Date(Date.now() - 1000) } });
    const expired = await access(a.id, a.paymentAccess.token);
    assert.equal(expired.status, 404);
    assert.equal(expired.body.code, "PAYMENT_ACCESS_INVALID");
    assert.equal((await uploadWith(a.id, a.paymentAccess.token)).status, 404);
    const untouched = await prisma.contactRequest.findUnique({ where: { id: a.id } });
    assert.equal(untouched.paymentStatus, "AWAITING_TRANSFER");

    const staffView = await admin.get(`/api/contact-requests/${b.id}`);
    assert.equal(staffView.status, 200);
    assert.equal(staffView.body.data.paymentAccessTokenHash, undefined, "the hash is never returned");
  });

  test("a quoted request has nothing to pay yet: no token", async () => {
    const visaType = await visa({ pricingMode: "QUOTE" });
    const created = await submit({ phone: testPhone(), visaType });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.paymentAccess, undefined);
  });

  test("a repeated submit (same key) creates no second request and gets a fresh token", async () => {
    const visaType = await visa({ pricingMode: "FIXED" });
    const phone = testPhone();
    const submissionKey = `TESTWF${uniqueSuffix()}`.replace(/[^A-Za-z0-9-]/g, "").padEnd(20, "0").slice(0, 40);
    const firstTry = await submit({ phone, visaType, acceptedTotal: "200.00", acceptedCurrency: "USD", submissionKey });
    const retry = await submit({ phone, visaType, acceptedTotal: "200.00", acceptedCurrency: "USD", submissionKey });
    assert.equal(firstTry.status, 201, JSON.stringify(firstTry.body));
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.data.id, firstTry.body.data.id);
    assert.equal(retry.body.data.duplicate, true);
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 1);
    assert.equal((await access(retry.body.data.id, retry.body.data.paymentAccess.token)).status, 200);
    assert.equal((await access(firstTry.body.data.id, firstTry.body.data.paymentAccess.token)).status, 404, "the replaced token stops working");
  });

  test("payment after document review: the step says so and shows no account", async () => {
    const visaType = await visa({ pricingMode: "FIXED", paymentAfterDocumentReview: true });
    const created = await submit({ phone: testPhone(), visaType, acceptedTotal: "200.00", acceptedCurrency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id, paymentAccess } = created.body.data;
    const summary = await access(id, paymentAccess.token);
    assert.equal(summary.body.data.paymentOpen, false);
    assert.deepEqual(summary.body.data.accounts, []);
    assert.ok(summary.body.data.lockReasons.length > 0);
    const early = await uploadWith(id, paymentAccess.token);
    assert.equal(early.status, 409, JSON.stringify(early.body));
  });
});

describe("payment access token: scope and limits", () => {
  async function fixedRequest() {
    const visaType = await visa({ pricingMode: "FIXED" });
    const created = await submit({ phone: testPhone(), visaType, acceptedTotal: "200.00", acceptedCurrency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.data;
  }

  test("the token never confirms or rejects a payment, nor opens staff, tracking or document routes", async () => {
    const { id, paymentAccess } = await fixedRequest();
    const withToken = (req) => req.set("X-Payment-Access", paymentAccess.token).set("X-Requested-With", "XMLHttpRequest");
    const asBearer = (req) => req.set("Authorization", `Bearer ${paymentAccess.token}`).set("X-Requested-With", "XMLHttpRequest");

    assert.ok((await uploadWith(id, paymentAccess.token)).status === 201);
    const document = await prisma.contactRequestDocument.findFirst({ where: { contactRequestId: id } });

    for (const make of [withToken, asBearer]) {
      assert.equal((await make(request(app).post(`/api/contact-requests/${id}/confirm-payment`)).send({})).status, 401, "confirm");
      assert.equal((await make(request(app).post(`/api/contact-requests/${id}/reject-payment`)).send({ reason: "TEST-WF رفض" })).status, 401, "reject");
      assert.equal((await make(request(app).get(`/api/contact-requests/${id}`))).status, 401, "staff detail");
      assert.equal((await make(request(app).get(`/api/contact-requests/${id}/documents/${document.id}/file`))).status, 401, "document file");
      assert.equal((await make(request(app).get("/api/tracking/requests"))).status, 401, "tracking list");
      assert.equal((await make(request(app).get(`/api/tracking/requests/${id}/documents/${document.id}/file`))).status, 401, "tracking document");
    }
    const stored = await prisma.contactRequest.findUnique({ where: { id } });
    assert.equal(stored.paymentStatus, "UNDER_REVIEW", "still waiting for staff");
    assert.equal(stored.paymentConfirmedAt, null);
  });

  test("the summary shows only payment facts: no documents, travelers, phone or passport data", async () => {
    const { id, paymentAccess } = await fixedRequest();
    const res = await access(id, paymentAccess.token);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data).sort(), [
      "accounts", "amount", "amountSdg", "currency", "expiresAt", "id", "lockReasons", "paymentOpen",
      "paymentStatus", "paymentStatusLabel", "rejectionReason", "service", "statusLabel", "visaTypeCode",
    ]);
    const text = JSON.stringify(res.body);
    assert.ok(!/phone|passport|documents|travelers|storagePath|fileName/i.test(text.replace(/"accounts"/, "")), text);
  });

  test("only a header token works; a query-string token or a lowercase variant of another request's token does not", async () => {
    const { id, paymentAccess } = await fixedRequest();
    assert.equal((await request(app).get(`/api/contact-requests/${id}/payment-access?token=${paymentAccess.token}`)).status, 404);
    assert.equal((await access(id, paymentAccess.token.toLowerCase() === paymentAccess.token ? `${paymentAccess.token.slice(0, -1)}A` : paymentAccess.token.toLowerCase())).status, 404);
  });

  test("receipt upload is validated: file required, type checked, refused once paid or closed", async () => {
    const { id, paymentAccess } = await fixedRequest();
    const noFile = await request(app).post(`/api/contact-requests/${id}/payment-access/receipt`).set("X-Payment-Access", paymentAccess.token);
    assert.equal(noFile.status, 400);
    const wrongType = await request(app)
      .post(`/api/contact-requests/${id}/payment-access/receipt`)
      .set("X-Payment-Access", paymentAccess.token)
      .attach("file", Buffer.from("not a receipt"), { filename: "r.txt", contentType: "text/plain" });
    assert.equal(wrongType.status, 400, JSON.stringify(wrongType.body));
    assert.equal((await prisma.contactRequest.findUnique({ where: { id } })).paymentStatus, "AWAITING_TRANSFER");

    assert.equal((await uploadWith(id, paymentAccess.token)).status, 201);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    assert.equal((await uploadWith(id, paymentAccess.token)).status, 409, "nothing to pay once confirmed");

    const other = await fixedRequest();
    await prisma.contactRequest.update({ where: { id: other.id }, data: { status: "CLOSED", outcome: "CANCELLED" } });
    const closed = await uploadWith(other.id, other.paymentAccess.token);
    assert.notEqual(closed.status, 201, "a closed request takes no receipt");
    const summary = await access(other.id, other.paymentAccess.token);
    assert.equal(summary.body.data.paymentOpen, false);
    assert.deepEqual(summary.body.data.accounts, []);
  });
});
