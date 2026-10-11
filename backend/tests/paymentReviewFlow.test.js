import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, registerCustomer, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { computeSdgSnapshot } from "../src/modules/finance/fx-snapshot.js";

const PDF = () => Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function trackingLogin(phone) {
  const agent = request.agent(app);
  const code = await request(app).post("/api/tracking/request-code").send({ phone });
  const verify = await agent.post("/api/tracking/verify-code").send({ phone, code: code.body.debugCode });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  return agent;
}

describe("frozen SDG equivalent", () => {
  test("computeSdgSnapshot keeps the original amount's currency, and gives null without a rate", () => {
    const at = new Date("2026-10-01T00:00:00Z");
    assert.deepEqual(computeSdgSnapshot("SAR", 100, { SAR: 160 }, at), { exchangeRateToSdg: 160, amountSdg: 16000, rateFixedAt: at });
    assert.deepEqual(computeSdgSnapshot("SDG", 250, {}, at), { exchangeRateToSdg: 1, amountSdg: 250, rateFixedAt: at });
    assert.deepEqual(computeSdgSnapshot("EGP", 100, { SAR: 160 }, at), { exchangeRateToSdg: null, amountSdg: null, rateFixedAt: null });
    assert.deepEqual(computeSdgSnapshot("SAR", "abc", { SAR: 160 }, at), { exchangeRateToSdg: null, amountSdg: null, rateFixedAt: null });
  });
});

describe("price -> payment accounts -> receipt -> review (contact request)", () => {
  let admin;
  let accountant;
  let employee;
  let originalRate;
  let account;

  before(async () => {
    admin = staffClient(await createStaffUser({ role: "ADMIN" }));
    accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
    employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
    originalRate = await prisma.setting.findUnique({ where: { key: "FX_SAR_SDG" } });
    await prisma.setting.upsert({ where: { key: "FX_SAR_SDG" }, update: { value: "160" }, create: { key: "FX_SAR_SDG", value: "160" } });
    account = await prisma.paymentAccount.create({
      data: { name: `Test SAR ${uniqueSuffix()}`, bankName: "Test Bank", accountName: "Nasaem", accountNumber: "12345", currency: "SAR", active: true },
    });
  });

  after(async () => {
    await prisma.paymentAccount.delete({ where: { id: account.id } }).catch(() => {});
    if (originalRate) await prisma.setting.update({ where: { key: "FX_SAR_SDG" }, data: { value: originalRate.value } });
    else await prisma.setting.deleteMany({ where: { key: "FX_SAR_SDG" } });
  });

  test("the whole loop: frozen rate, accounts only after approval, receipt -> review, rejection with reason, then acceptance", async () => {
    const { agent: customerAgent, customer } = await registerCustomer();
    const phone = customer.phone;
    const submit = await customerAgent.post("/api/contact-requests").send({ name: "Payment Flow", phone, message: "طلب عمرة لاختبار الدفع" });
    assert.equal(submit.status, 201, JSON.stringify(submit.body));
    const id = submit.body.data.id;

    // 1) staff issue the price: the SDG equivalent is frozen with it
    const invoiceRes = await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 1000, currency: "SAR", description: "عمرة" });
    assert.equal(invoiceRes.status, 200, JSON.stringify(invoiceRes.body));
    assert.equal(Number(invoiceRes.body.data.exchangeRateToSdg), 160);
    assert.equal(Number(invoiceRes.body.data.amountSdg), 160000);
    assert.equal(invoiceRes.body.data.currency, "SAR");
    await prisma.setting.update({ where: { key: "FX_SAR_SDG" }, data: { value: "200" } });

    const tracking = await trackingLogin(phone);
    let tracked = (await tracking.get("/api/tracking/requests")).body.data.find((r) => r.id === id);
    assert.equal(Number(tracked.invoice.amountSdg), 160000, "a later rate change must not alter an issued price");
    assert.deepEqual(tracked.paymentAccounts, [], "no payment accounts before the customer approves the price");
    assert.deepEqual((await tracking.get("/api/tracking/payment-accounts?currency=SAR")).body.data, []);

    // the customer got an in-app notification that opens this request
    const notifications = await customerAgent.get("/api/customer/notifications?limit=50");
    const priceNote = notifications.body.data.find((n) => n.type === "CONTACT_REQUEST_INVOICE_SET");
    assert.ok(priceNote, "expected a price notification");
    assert.equal(priceNote.contactRequestId, id);

    // 2) customer approves -> accounts for THAT currency only
    assert.equal((await tracking.post(`/api/tracking/requests/${id}/invoice/approve`)).status, 200);
    tracked = (await tracking.get("/api/tracking/requests")).body.data.find((r) => r.id === id);
    assert.ok(tracked.paymentAccounts.some((a) => a.id === account.id));
    assert.ok(tracked.paymentAccounts.every((a) => a.currency === "SAR"));
    assert.deepEqual((await tracking.get("/api/tracking/payment-accounts?currency=USD")).body.data, []);

    // 3) uploading the receipt puts it under review - it is NOT paid
    const receipt = await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("label", "إثبات الدفع").attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" });
    assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
    tracked = (await tracking.get("/api/tracking/requests")).body.data.find((r) => r.id === id);
    assert.equal(tracked.paymentStatus, "UNDER_REVIEW");
    assert.equal((await tracking.post(`/api/tracking/requests/${id}/mark-transfer-sent`)).status, 200, "declaring after the receipt is a harmless no-op");

    // staff are told, with a link to the request (accountant included)
    const accountantNotes = await accountant.get("/api/notifications?limit=50");
    const receiptNote = accountantNotes.body.data.find((n) => n.type === "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED" && n.contactRequestId === id);
    assert.ok(receiptNote, "the accountant must get a notification linked to the request");

    // 4) rejection needs a reason, and only senior finance roles can do it
    assert.equal((await employee.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "الإيصال غير واضح" })).status, 403);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/reject-payment`).send({})).status, 400);
    const rejected = await accountant.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "المبلغ غير مطابق" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal((await accountant.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "مرة ثانية" })).status, 409);

    tracked = (await tracking.get("/api/tracking/requests")).body.data.find((r) => r.id === id);
    assert.equal(tracked.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(tracked.paymentRejection.reason, "المبلغ غير مطابق");
    assert.equal(tracked.documents.find((d) => d.label === "إشعار الدفع").status, "REJECTED");
    const rejectedNote = (await customerAgent.get("/api/customer/notifications?limit=50")).body.data.find((n) => n.type === "CONTACT_REQUEST_PAYMENT_REJECTED");
    assert.ok(rejectedNote?.message.includes("المبلغ غير مطابق"));
    assert.equal(rejectedNote.contactRequestId, id);

    // 5) a new receipt clears the rejection and goes back to review; acceptance confirms
    const second = await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("label", "إثبات الدفع").attach("file", PDF(), { filename: "receipt2.pdf", contentType: "application/pdf" });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    tracked = (await tracking.get("/api/tracking/requests")).body.data.find((r) => r.id === id);
    assert.equal(tracked.paymentStatus, "UNDER_REVIEW");
    assert.equal(tracked.paymentRejection, null);

    assert.equal((await employee.post(`/api/contact-requests/${id}/confirm-payment`)).status, 403);
    const confirmed = await accountant.post(`/api/contact-requests/${id}/confirm-payment`);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.data.paymentStatus, "CONFIRMED");

    // the approved price can no longer be changed by anyone
    assert.equal((await admin.post(`/api/contact-requests/${id}/invoice`).send({ amount: 1, currency: "SAR" })).status, 409);

    const confirmedNote = (await customerAgent.get("/api/customer/notifications?limit=50")).body.data.find((n) => n.type === "CONTACT_REQUEST_PAYMENT_CONFIRMED");
    assert.equal(confirmedNote?.contactRequestId, id);
    const actions = (await prisma.activityLog.findMany({ where: { entity: "ContactRequest", entityId: id } })).map((row) => row.action);
    for (const expected of ["CONTACT_REQUEST_INVOICE_SET", "CONTACT_REQUEST_PAYMENT_REJECTED", "CONTACT_REQUEST_PAYMENT_CONFIRMED"]) {
      assert.ok(actions.includes(expected), `audit trail must contain ${expected}`);
    }
  });
});
