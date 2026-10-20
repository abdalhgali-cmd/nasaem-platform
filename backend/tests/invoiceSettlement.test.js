import "./env.js";
import "./helpers/journeyLimits.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone, trackingClient } from "./helpers/workflow.js";
import { settlementOptions } from "../src/modules/payment-settlement/payment-settlement.service.js";

// Issue #132: a USD invoice may be settled by bank transfer either in USD,
// or — only into an SDG account the agency explicitly marked «يقبل المقابل
// بالجنيه» — with the SDG amount frozen on the invoice when it was issued.
// The server checks the chosen account and the invoice version under the
// request lock, stores what the customer says they paid with the receipt,
// and never changes the invoice. A receipt is never a payment.

let admin;
let accountant;
let employee;
let usdAccount;
let sdgFlagged;
let sdgPlain;
let previousRates;

// logActivity writes after the response; wait for the row.
async function auditRow(where) {
  for (let i = 0; i < 40; i += 1) {
    const row = await prisma.activityLog.findFirst({ where, orderBy: { createdAt: "desc" } });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function createAccount(currency, extra = {}) {
  const res = await admin.post("/api/payment-accounts").send({
    name: `TEST-WF ${currency} ${uniqueSuffix()}`,
    bankName: `TEST-WF Bank ${currency}`,
    accountName: "TEST-WF Holder",
    accountNumber: `7${uniqueSuffix().slice(-9)}`,
    currency,
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  previousRates = (await admin.get("/api/flights/admin/rates")).body.data;
  const rates = await admin.patch("/api/flights/admin/rates").send({ ...previousRates, USD: 9200 });
  assert.equal(rates.status, 200, JSON.stringify(rates.body));
  usdAccount = await createAccount("USD");
  sdgFlagged = await createAccount("SDG", { acceptsForeignInvoices: true });
  sdgPlain = await createAccount("SDG");
});

after(async () => {
  if (previousRates) await admin.patch("/api/flights/admin/rates").send(previousRates);
  // Test accounts must not be offered to anything else that runs later.
  await prisma.paymentAccount.updateMany({ where: { id: { in: [usdAccount, sdgFlagged, sdgPlain].filter(Boolean).map((a) => a.id) } }, data: { active: false } });
});

async function fixedVisa() {
  const created = await admin.post("/api/visa-types").send({
    code: `TEST-WF-ST-${uniqueSuffix()}`,
    name: "TEST-WF تأشيرة سداد",
    country: "TEST",
    basePrice: 85,
    currency: "USD",
    active: true,
    pricingMode: "FIXED",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data;
}

async function submitFixed(phone = testPhone()) {
  const visaType = await fixedVisa();
  const res = await request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-WF عميل")
    .field("phone", phone)
    .field("message", "TEST-WF طلب")
    .field("visaTypeId", visaType.id)
    .field("travelerCount", "1")
    .field("acceptedTotal", "85.00")
    .field("acceptedCurrency", "USD");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { version } = await prisma.invoice.findFirst({ where: { contactRequestId: res.body.data.id }, select: { version: true } });
  return { id: res.body.data.id, token: res.body.data.paymentAccess.token, phone, version };
}

const summaryOf = (id, token) => request(app).get(`/api/contact-requests/${id}/payment-access`).set("X-Payment-Access", token);

function upload(id, token, fields = {}) {
  let req = request(app).post(`/api/contact-requests/${id}/payment-access/receipt`).set("X-Payment-Access", token);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
  return req.attach("file", PDF(), { filename: "transfer.pdf", contentType: "application/pdf" });
}

describe("settlement options (pure)", () => {
  const invoice = { amount: "85", currency: "USD", amountSdg: "782000", exchangeRateToSdg: "9200", rateFixedAt: "2026-10-20T00:00:00.000Z", version: 1 };
  const usd = { id: "u", currency: "USD", bankName: "B", accountName: "H", accountNumber: "1", iban: null, name: "n", acceptsForeignInvoices: false };
  const sdg = { id: "s", currency: "SDG", bankName: "B", accountName: "H", accountNumber: "2", iban: null, name: "n", acceptsForeignInvoices: false };

  test("only the invoice currency by default — no cross-currency option", () => {
    const options = settlementOptions(invoice, [usd, sdg]);
    assert.deepEqual(options.map((o) => [o.accountId, o.kind, o.payCurrency, o.payAmount]), [["u", "INVOICE_CURRENCY", "USD", "85"]]);
    assert.ok(options.every((o) => !("acceptsForeignInvoices" in o)), "the agency flag is not published");
  });

  test("an SDG account the agency marked takes the frozen SDG amount at the invoice's rate", () => {
    const options = settlementOptions(invoice, [usd, { ...sdg, acceptsForeignInvoices: true }]);
    const option = options.find((o) => o.kind === "SDG_EQUIVALENT");
    assert.deepEqual([option.accountId, option.payCurrency, option.payAmount, option.rate], ["s", "SDG", "782000", "9200"]);
  });

  test("no SDG option without an SDG amount frozen on the invoice", () => {
    const unfrozen = { ...invoice, amountSdg: null, exchangeRateToSdg: null };
    assert.equal(settlementOptions(unfrozen, [{ ...sdg, acceptsForeignInvoices: true }]).length, 0);
  });
});

describe("payment accounts: the agency's SDG-equivalent opt-in", () => {
  test("only an SDG account can accept the SDG equivalent; changing currency clears it; audited", async () => {
    const refused = await admin.post("/api/payment-accounts").send({ name: "TEST-WF x", bankName: "TEST-WF B", accountName: "TEST-WF H", accountNumber: "123", currency: "USD", acceptsForeignInvoices: true });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "FOREIGN_SETTLEMENT_SDG_ONLY");

    const account = await createAccount("SDG", { acceptsForeignInvoices: true, active: false });
    assert.equal(account.acceptsForeignInvoices, true);
    const created = await auditRow({ entityId: account.id, action: "PAYMENT_ACCOUNT_CREATED" });
    assert.equal(created.newValue.acceptsForeignInvoices, true);

    const toUsd = await admin.patch(`/api/payment-accounts/${account.id}`).send({ currency: "USD" });
    assert.equal(toUsd.status, 200, JSON.stringify(toUsd.body));
    assert.equal(toUsd.body.data.acceptsForeignInvoices, false, "a non-SDG account never keeps the flag");
    const flagOnUsd = await admin.patch(`/api/payment-accounts/${account.id}`).send({ acceptsForeignInvoices: true });
    assert.equal(flagOnUsd.status, 400);

    const updated = await auditRow({ entityId: account.id, action: "PAYMENT_ACCOUNT_UPDATED", newValue: { path: ["acceptsForeignInvoices"], equals: false } });
    assert.equal(updated.oldValue.acceptsForeignInvoices, true);
    assert.equal(updated.newValue.acceptsForeignInvoices, false);

    assert.equal((await admin.patch(`/api/payment-accounts/does-not-exist`).send({ active: false })).status, 404);
  });

  test("an employee cannot add, edit or list the agency accounts", async () => {
    assert.equal((await employee.post("/api/payment-accounts").send({ name: "TEST-WF x", bankName: "TEST-WF B", accountName: "TEST-WF H", accountNumber: "1", currency: "SDG" })).status, 403);
    assert.equal((await employee.patch(`/api/payment-accounts/${sdgPlain.id}`).send({ acceptsForeignInvoices: true })).status, 403);
    assert.equal((await employee.get("/api/payment-accounts")).status, 403);
    assert.equal((await request(app).post("/api/payment-accounts").send({})).status, 401);
  });
});

describe("paying a USD invoice", () => {
  test("the payment link offers USD and the marked SDG account at the frozen amount — and nothing private", async () => {
    const { id, token } = await submitFixed();
    const res = await summaryOf(id, token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const data = res.body.data;
    assert.equal(data.amount, "85");
    assert.equal(data.currency, "USD");
    assert.equal(Number(data.amountSdg), 782000);
    assert.equal(Number(data.exchangeRateToSdg), 9200);
    assert.ok(Number.isInteger(data.invoiceVersion));
    const byId = new Map(data.settlementOptions.map((o) => [o.accountId, o]));
    assert.equal(byId.get(usdAccount.id)?.kind, "INVOICE_CURRENCY");
    assert.equal(byId.get(usdAccount.id)?.payAmount, "85");
    assert.equal(byId.get(sdgFlagged.id)?.kind, "SDG_EQUIVALENT");
    assert.equal(Number(byId.get(sdgFlagged.id)?.payAmount), 782000);
    assert.equal(byId.has(sdgPlain.id), false, "an SDG account the agency did not mark is not offered");
    assert.ok(data.accounts.every((a) => a.currency === "USD"), "older apps still see only the invoice currency");
    const body = JSON.stringify(data);
    for (const leak of ["acceptsForeignInvoices", "phone", "documents", "travelers", "passport", "email"]) assert.equal(body.includes(`"${leak}"`), false, `no ${leak} in the token summary`);
  });

  test("receipt for the SDG equivalent: under review with the settlement stored; the invoice unchanged; confirmation records SDG on the paid receipt", async () => {
    const { id, token } = await submitFixed();
    const before = await prisma.invoice.findFirst({ where: { contactRequestId: id } });
    const uploaded = await upload(id, token, { settlementAccountId: sdgFlagged.id, invoiceVersion: before.version });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.data.request.paymentStatus, "UNDER_REVIEW");
    assert.equal(uploaded.body.data.request.paymentStatusLabel, "بانتظار مراجعة الدفع");

    const stored = await prisma.contactRequest.findUnique({ where: { id }, include: { documents: true, invoice: true } });
    assert.equal(stored.paymentStatus, "UNDER_REVIEW", "never paid on upload");
    assert.equal(stored.paymentConfirmedAt, null);
    const receipt = stored.documents.find((d) => d.classification === "FINANCIAL_DOCUMENT");
    assert.equal(receipt.paymentSettlement.kind, "SDG_EQUIVALENT");
    assert.equal(receipt.paymentSettlement.payCurrency, "SDG");
    assert.equal(Number(receipt.paymentSettlement.payAmount), 782000);
    assert.equal(receipt.paymentSettlement.invoiceCurrency, "USD");
    assert.equal(receipt.paymentSettlement.accountId, sdgFlagged.id);
    assert.equal(receipt.paymentSettlement.account.accountNumber, sdgFlagged.accountNumber);
    assert.deepEqual(
      [String(stored.invoice.amount), stored.invoice.currency, String(stored.invoice.amountSdg), String(stored.invoice.exchangeRateToSdg), stored.invoice.version],
      [String(before.amount), before.currency, String(before.amountSdg), String(before.exchangeRateToSdg), before.version],
      "the invoice and its frozen rate are untouched"
    );
    const audit = await prisma.activityLog.findFirst({ where: { entityId: id, action: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED" } });
    assert.equal(audit.newValue.settlement.kind, "SDG_EQUIVALENT");

    // The staff see the receipt and its settlement; an employee cannot confirm.
    const detail = await admin.get(`/api/contact-requests/${id}`);
    assert.equal(detail.status, 200);
    const shown = detail.body.data.documents.find((d) => d.id === receipt.id);
    assert.equal(shown.paymentSettlement.payCurrency, "SDG");
    const file = await admin.get(`/api/contact-requests/${id}/documents/${receipt.id}/file`);
    assert.equal(file.status, 200, "the receipt downloads for staff");
    assert.equal((await employee.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 403);

    // The payment-review queue shows what to look for in which account.
    const queue = await accountant.get("/api/dashboard/operations");
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    const item = queue.body.data.items.find((row) => row.id === id);
    assert.equal(item.transferClaim.kind, "SDG_EQUIVALENT");
    assert.equal(Number(item.transferClaim.payAmount), 782000);
    assert.equal(item.transferClaim.accountNumber, sdgFlagged.accountNumber);

    const confirmed = await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({});
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const paid = await prisma.paymentReceipt.findUnique({ where: { contactRequestId: id } });
    assert.equal(paid.currency, "USD", "the paid receipt keeps the invoice currency");
    assert.equal(String(paid.amount), "85");
    assert.equal(paid.settlementCurrency, "SDG");
    assert.equal(Number(paid.settlementAmount), 782000);
  });

  test("a USD receipt into the USD account records no cross-currency settlement", async () => {
    const { id, token, version } = await submitFixed();
    const uploaded = await upload(id, token, { settlementAccountId: usdAccount.id, invoiceVersion: version });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    const paid = await prisma.paymentReceipt.findUnique({ where: { contactRequestId: id } });
    assert.equal(paid.settlementCurrency, null);
    assert.equal(paid.settlementAmount, null);
  });

  test("an SDG account the agency did not mark, a disabled account or an unknown one is refused; nothing is stored", async () => {
    const { id, token, version } = await submitFixed();
    for (const accountId of [sdgPlain.id, "nonexistent_account", "bad id!"]) {
      const res = await upload(id, token, { settlementAccountId: accountId, invoiceVersion: version });
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(res.body.code, "SETTLEMENT_ACCOUNT_INVALID");
    }
    const stored = await prisma.contactRequest.findUnique({ where: { id }, include: { documents: true } });
    assert.equal(stored.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(stored.documents.filter((d) => d.classification === "FINANCIAL_DOCUMENT").length, 0);

    const second = await submitFixed();
    const temp = await createAccount("SDG", { acceptsForeignInvoices: true });
    assert.equal((await admin.patch(`/api/payment-accounts/${temp.id}`).send({ active: false })).status, 200);
    const disabled = await upload(second.id, second.token, { settlementAccountId: temp.id, invoiceVersion: second.version });
    assert.equal(disabled.status, 409);
    assert.equal(disabled.body.code, "SETTLEMENT_ACCOUNT_INVALID");
  });

  test("a stale invoice version is refused", async () => {
    const { id, token } = await submitFixed();
    const res = await upload(id, token, { settlementAccountId: usdAccount.id, invoiceVersion: 999 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "INVOICE_CHANGED");
    const unversioned = await upload(id, token, { settlementAccountId: usdAccount.id });
    assert.equal(unversioned.status, 409, "a chosen account comes with the invoice version it was shown against");
    assert.equal(unversioned.body.code, "INVOICE_CHANGED");
  });

  test("an older app that sends no account still works: recorded in the invoice currency", async () => {
    const { id, token } = await submitFixed();
    assert.equal((await upload(id, token)).status, 201);
    const receipt = await prisma.contactRequestDocument.findFirst({ where: { contactRequestId: id, classification: "FINANCIAL_DOCUMENT" } });
    assert.equal(receipt.paymentSettlement.kind, "INVOICE_CURRENCY");
    assert.equal(receipt.paymentSettlement.source, "CLIENT_WITHOUT_ACCOUNT");
    assert.equal(receipt.paymentSettlement.payCurrency, "USD");
  });

  test("two simultaneous submits store exactly one receipt", async () => {
    const { id, token, version } = await submitFixed();
    const results = await Promise.all([1, 2, 3].map(() => upload(id, token, { settlementAccountId: sdgFlagged.id, invoiceVersion: version })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409], JSON.stringify(results.map((r) => r.body)));
    assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.code === "PAYMENT_NOT_AWAITING"));
    const count = await prisma.contactRequestDocument.count({ where: { contactRequestId: id, classification: "FINANCIAL_DOCUMENT" } });
    assert.equal(count, 1);
  });

  test("phone tracking shows the same options and validates the same way", async () => {
    const { id, phone } = await submitFixed();
    const tracking = trackingClient(phone);
    const row = await tracking.request(id);
    const kinds = new Map(row.paymentSettlementOptions.map((o) => [o.accountId, o.kind]));
    assert.equal(kinds.get(sdgFlagged.id), "SDG_EQUIVALENT");
    assert.equal(kinds.has(sdgPlain.id), false);
    const refused = await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("settlementAccountId", sdgPlain.id).field("invoiceVersion", String(row.invoice.version)).attach("file", PDF(), { filename: "r.pdf", contentType: "application/pdf" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "SETTLEMENT_ACCOUNT_INVALID");
    const ok = await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("settlementAccountId", sdgFlagged.id).field("invoiceVersion", String(row.invoice.version)).attach("file", PDF(), { filename: "r.pdf", contentType: "application/pdf" });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await tracking.request(id)).paymentStatus, "UNDER_REVIEW");
    // Nothing to pay into once a receipt is under review.
    assert.deepEqual((await tracking.request(id)).paymentSettlementOptions, []);
  });
});
