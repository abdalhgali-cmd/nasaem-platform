import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStepKey, progressBlockHtml, progressSteps, stepAction, stepPanelHtml } from "../www/js/progress-view.js";
import { paymentActions, paymentState } from "../www/js/payment-view.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Server progress shapes (backend request-progress.js) for both pricing modes.
const fixedSteps = (states, extra = {}) => ({
  pricingMode: "FIXED",
  pricing: { total: 300, currency: "USD", unitPrice: 150, units: 2, priceUnit: "PER_TRAVELER" },
  label: "x",
  steps: [
    { key: "RECEIVED", label: "تأكيد الطلب بالسعر الثابت", state: states[0], status: "أكّدت الطلب بإجمالي 300 USD (سعر ثابت)." },
    { key: "DOCUMENTS", label: "مراجعة المستندات والبيانات", state: states[1], status: "مستندات مطلوبة لم تُرفع: الجواز." },
    { key: "PAYMENT", label: "تحويل المبلغ ورفع الإيصال", state: states[2], status: "بانتظار تحويل المبلغ ورفع إيصال الدفع." },
    { key: "PAYMENT_REVIEW", label: "مراجعة الإيصال وقبول الدفع", state: states[3], status: "الإيصال قيد مراجعة الوكالة؛ لم يُقبل الدفع بعد." },
    { key: "EXECUTION", label: "إصدار التذكرة", state: states[4], status: "جارٍ إصدار تذكرة الطيران — بدأ التنفيذ ولم يكتمل بعد.", started: states[4] === "current" && extra.started },
    { key: "DELIVERY", label: "تسليم التذكرة", state: states[5], status: "لم تُنشر الملفات النهائية بعد." },
  ],
  ...extra,
});

test("fixed-price requests show no quote circle", () => {
  const html = progressBlockHtml(fixedSteps(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]), esc, { id: "r1" });
  assert.doesNotMatch(html, /data-step="QUOTE"/);
  assert.match(html, /data-pricing-mode="FIXED"/);
  // the opened stage (documents, current) shows the server's real status
  assert.match(html, /مستندات مطلوبة لم تُرفع: الجواز/);
});

test("a receipt upload is not an accepted payment; execution started is not completed", () => {
  const receipt = progressSteps(fixedSteps(["done", "done", "done", "current", "upcoming", "upcoming"]));
  assert.equal(receipt.find((s) => s.key === "PAYMENT").state, "done");
  assert.equal(receipt.find((s) => s.key === "PAYMENT_REVIEW").state, "current");
  const html = progressBlockHtml(fixedSteps(["done", "done", "done", "done", "current", "upcoming"], { started: true }), esc, {});
  assert.match(html, /progress-node-current progress-node-started/);
  assert.match(html, /aria-label="5 من 6: إصدار التذكرة — قيد التنفيذ، لم تكتمل بعد"/);
  assert.doesNotMatch(html, /data-step="EXECUTION" data-state="done"/);
  assert.match(html, /قيد التنفيذ — لم تكتمل بعد/);
});

test("each stage offers only the action the server allows", () => {
  const steps = progressSteps(fixedSteps(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]));
  const docs = steps.find((s) => s.key === "DOCUMENTS");
  const request = { status: "NEW", allowedActions: ["UPLOAD_DOCUMENT", "UPLOAD_RECEIPT"], checklist: [{ required: true, state: "MISSING" }] };
  assert.deepEqual(stepAction(docs, request), { label: "رفع المستندات المطلوبة", target: "#documentsBlock", mode: "show" });
  assert.equal(stepAction(steps.find((s) => s.key === "PAYMENT"), request).target, "#uploadReceiptBtn");
  assert.equal(stepAction(steps.find((s) => s.key === "PAYMENT"), { ...request, allowedActions: [] }), null, "locked or not allowed: no action");
  assert.equal(stepAction(steps.find((s) => s.key === "PAYMENT"), { ...request, status: "CLOSED" }), null, "closed: nothing");
  assert.equal(stepAction({ key: "QUOTE" }, { allowedActions: ["APPROVE_QUOTE"] }).target, "#quoteBlock");
  assert.equal(stepAction({ key: "QUOTE" }, { allowedActions: [] }), null);
  assert.equal(stepAction({ key: "EXECUTION" }, request), null, "execution is the agency's step");
  const panel = stepPanelHtml(docs, request, fixedSteps([]), esc);
  assert.match(panel, /data-progress-target="#documentsBlock"/);
  const received = stepPanelHtml(steps[0], { id: "REQ-1" }, fixedSteps([]), esc);
  assert.match(received, /الإجمالي المؤكد/);
  assert.match(received, /REQ-1/);
});

test("the default stage is the current one, else the last completed", () => {
  assert.equal(defaultStepKey(progressSteps(fixedSteps(["done", "done", "current", "upcoming", "upcoming", "upcoming"]))), "PAYMENT");
  assert.equal(defaultStepKey(progressSteps(fixedSteps(["done", "done", "done", "done", "done", "done"]))), "DELIVERY");
});

test("payment locked until the documents are approved (fixed price)", () => {
  const request = { paymentStatus: "AWAITING_TRANSFER", invoice: { status: "APPROVED", amount: 300, currency: "USD" }, allowedActions: [], progress: { pricingMode: "FIXED", paymentLocked: true } };
  assert.equal(paymentState(request).key, "PAYMENT_LOCKED");
  assert.equal(paymentActions(request).canPay, false);
  assert.equal(paymentActions(request).canApprove, false);
});
