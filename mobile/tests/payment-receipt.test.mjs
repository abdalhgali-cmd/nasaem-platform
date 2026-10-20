import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAlreadySubmitted,
  needsRefresh,
  noSettlementAccountHtml,
  normalizeSettlementOptions,
  receiptFormData,
  settlementOptionsHtml,
} from "../www/js/payment-receipt.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const usd = { accountId: "u1", id: "u1", kind: "INVOICE_CURRENCY", payCurrency: "USD", payAmount: "85", currency: "USD", bankName: "بنك الدولار", accountName: "الوكالة", accountNumber: "111" };
const sdg = { accountId: "s1", id: "s1", kind: "SDG_EQUIVALENT", payCurrency: "SDG", payAmount: "782000", rate: "9200", currency: "SDG", bankName: "بنك الجنيه", accountName: "الوكالة", accountNumber: "222" };

test("server options are used as given; an older server's accounts become invoice-currency options", () => {
  assert.deepEqual(normalizeSettlementOptions({ settlementOptions: [usd, sdg] }).map((o) => o.accountId), ["u1", "s1"]);
  assert.deepEqual(normalizeSettlementOptions({ settlementOptions: [] , accounts: [{ id: "x", currency: "USD" }] }), [], "an empty server answer is not overridden");
  const legacy = normalizeSettlementOptions({ accounts: [{ id: "x", currency: "USD", bankName: "B" }], amount: "85", currency: "USD" });
  assert.deepEqual(legacy.map((o) => [o.accountId, o.kind, o.payCurrency, o.payAmount]), [["x", "INVOICE_CURRENCY", "USD", "85"]]);
});

test("each account shows the exact amount in its own currency with copy buttons; SDG explains the frozen rate", () => {
  const html = settlementOptionsHtml([usd, sdg], esc, { invoiceAmount: "85", invoiceCurrency: "USD" });
  assert.match(html, /85 USD/);
  assert.match(html, /782,000 SDG/);
  assert.match(html, /9,200/);
  assert.match(html, /فاتورتك الأصلية <bdi>85 USD<\/bdi> لا تتغيّر/);
  assert.match(html, /data-copy="111"/);
  assert.match(html, /data-copy="222"/);
  assert.equal((html.match(/checked/g) || []).length, 0, "with two accounts the customer chooses");
  assert.equal((settlementOptionsHtml([usd], esc).match(/ checked/g) || []).length, 1, "a single account is selected");
});

test("account text is escaped", () => {
  const html = settlementOptionsHtml([{ ...usd, bankName: "<img src=x onerror=alert(1)>" }], esc);
  assert.equal(html.includes("<img src=x"), false);
});

test("no account: says so accurately, no transfer before contact", () => {
  assert.match(noSettlementAccountHtml(esc, "USD"), /بعملة الفاتورة \(USD\) أو بمقابلها بالجنيه/);
  assert.match(noSettlementAccountHtml(esc, "USD"), /لا تحوّل أي مبلغ/);
});

test("the receipt body carries the account and invoice version before the file", () => {
  const file = new Blob(["%PDF"], { type: "application/pdf" });
  const form = receiptFormData(file, { accountId: "s1", invoiceVersion: 3, label: "إثبات الدفع" });
  assert.deepEqual([...form.keys()], ["settlementAccountId", "invoiceVersion", "label", "file"]);
  assert.equal(form.get("invoiceVersion"), "3");
  assert.deepEqual([...receiptFormData(file).keys()], ["file"]);
});

test("a refused duplicate means the receipt is already in; settlement refusals ask for a refresh", () => {
  assert.equal(isAlreadySubmitted({ status: 409, code: "PAYMENT_NOT_AWAITING" }), true);
  assert.equal(isAlreadySubmitted({ status: 409, code: "INVOICE_CHANGED" }), false);
  assert.equal(needsRefresh({ status: 409, code: "INVOICE_CHANGED" }), true);
  assert.equal(needsRefresh({ status: 409, code: "SETTLEMENT_ACCOUNT_INVALID" }), true);
  assert.equal(needsRefresh({ status: 0 }), false);
});
