import { test } from "node:test";
import assert from "node:assert/strict";
import { progressBlockHtml, progressSteps } from "../www/js/progress-view.js";
import { paymentState } from "../www/js/payment-view.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const paidAwaiting = {
  stage: "PAYMENT_ACCEPTED",
  label: "تم قبول الدفع، بانتظار بدء التنفيذ",
  serviceKindLabel: "حجز الفنادق",
  steps: [
    { key: "RECEIVED", label: "استلام الطلب ومراجعة المستندات", state: "done" },
    { key: "QUOTE", label: "عرض السعر والموافقة عليه", state: "done" },
    { key: "PAYMENT", label: "مراجعة الدفع وقبوله", state: "done" },
    { key: "EXECUTION", label: "تأكيد الحجز مع الفندق", state: "current" },
    { key: "DELIVERY", label: "تسليم تأكيد الحجز", state: "upcoming" },
  ],
};

test("the progress block renders the server's stages as connected tappable circles", () => {
  const html = progressBlockHtml(paidAwaiting, esc);
  assert.match(html, /تم قبول الدفع، بانتظار بدء التنفيذ/);
  assert.match(html, /role="tablist" aria-label="مراحل الطلب"/);
  // one circle (tab) per server stage, in order, each with an accessible name
  const tabs = [...html.matchAll(/role="tab"[^>]*data-step="(\w+)"[^>]*data-state="(\w+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs, [["RECEIVED", "done"], ["QUOTE", "done"], ["PAYMENT", "done"], ["EXECUTION", "current"], ["DELIVERY", "upcoming"]]);
  assert.match(html, /aria-label="4 من 5: تأكيد الحجز مع الفندق — المرحلة الحالية"/);
  assert.match(html, /aria-label="1 من 5: استلام الطلب ومراجعة المستندات — مكتملة"/);
  assert.match(html, /aria-label="5 من 5: تسليم تأكيد الحجز — لم تبدأ بعد"/);
  // the current stage is selected and is the single tab stop
  assert.match(html, /data-step="EXECUTION" data-state="current"\s+aria-selected="true" aria-controls="progressStepPanel" tabindex="0" aria-current="step"/);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  assert.match(html, /حجز الفنادق/);
  assert.equal(progressBlockHtml(null, esc), "");
  assert.equal(progressBlockHtml({ steps: [] }, esc), "");
  assert.deepEqual(progressSteps({ steps: [{ key: "X", label: "x", state: "weird" }] }), [{ key: "X", label: "x", state: "upcoming", status: "" }]);
  assert.doesNotMatch(progressBlockHtml({ ...paidAwaiting, label: "<img src=x>" }, esc), /<img/);
});

test("an accepted payment says 'awaiting execution' until the agency records execution", () => {
  assert.match(paymentState({ paymentStatus: "CONFIRMED", progress: paidAwaiting }).detail, /بانتظار بدء التنفيذ/);
  assert.match(paymentState({ paymentStatus: "CONFIRMED" }).detail, /بانتظار بدء التنفيذ/);
  const executing = paymentState({ paymentStatus: "CONFIRMED", progress: { ...paidAwaiting, stage: "IN_EXECUTION" } });
  assert.doesNotMatch(executing.detail, /بانتظار بدء التنفيذ/);
  assert.doesNotMatch(paymentState({ paymentStatus: "CONFIRMED" }).detail, /التأشيرة|تذكرة|الفندق/);
});

const step = (key, label, state, status = "") => ({ key, label, state, status });
const fixedSteps = (states) => ({
  label: states.label,
  pricingMode: "FIXED",
  steps: [
    step("RECEIVED", "تأكيد الطلب بالسعر الثابت", states.RECEIVED),
    step("DOCUMENTS", "مراجعة المستندات والبيانات", states.DOCUMENTS),
    step("PAYMENT", "تحويل المبلغ ورفع الإيصال", states.PAYMENT, "بانتظار تحويل المبلغ ورفع إيصال الدفع."),
    step("PAYMENT_REVIEW", "مراجعة الإيصال وقبول الدفع", states.PAYMENT_REVIEW),
    step("EXECUTION", "إصدار التأشيرة", states.EXECUTION, "جارٍ إصدار التأشيرة — بدأ التنفيذ ولم يكتمل بعد."),
    step("DELIVERY", "تسليم التأشيرة", states.DELIVERY),
  ],
});

test("customer journey: four moments, agency review folded into them", async () => {
  const { customerJourney } = await import("../www/js/progress-view.js");
  const journey = customerJourney(fixedSteps({ label: "جارٍ إصدار التأشيرة", RECEIVED: "done", DOCUMENTS: "done", PAYMENT: "done", PAYMENT_REVIEW: "done", EXECUTION: "current", DELIVERY: "upcoming" }), { status: "NEW", allowedActions: [] });
  assert.deepEqual(journey.stages.map((s) => [s.label, s.state]), [
    ["تم استلام الطلب", "done"], ["الدفع", "done"], ["إصدار التأشيرة", "current"], ["تسليم التأشيرة", "upcoming"],
  ]);
  assert.equal(journey.headline, "جارٍ إصدار التأشيرة", "the server's own line");
  assert.equal(journey.action, null);
  assert.ok(!journey.stages.some((s) => /مراجعة/.test(s.label)), "no internal review step");
});

test("customer journey: receipt under review is a sub-status of «الدفع»", async () => {
  const { customerJourney } = await import("../www/js/progress-view.js");
  const journey = customerJourney(fixedSteps({ label: "بانتظار مراجعة إثبات التحويل", RECEIVED: "done", DOCUMENTS: "done", PAYMENT: "done", PAYMENT_REVIEW: "current", EXECUTION: "upcoming", DELIVERY: "upcoming" }), { status: "NEW", allowedActions: [] });
  const pay = journey.stages.find((s) => s.key === "PAY");
  assert.equal(pay.state, "current");
  assert.equal(pay.detail, "يراجع موظف الوكالة التحويل ويؤكده.");
});

test("customer journey never hides what the customer must do: a rejected document wins", async () => {
  const { customerJourney } = await import("../www/js/progress-view.js");
  const request = {
    status: "NEW",
    allowedActions: ["UPLOAD_DOCUMENT", "UPLOAD_RECEIPT"],
    checklist: [{ required: true, state: "REJECTED" }],
    paymentRejection: { reason: "غير واضح" },
  };
  const journey = customerJourney(fixedSteps({ label: "x", RECEIVED: "done", DOCUMENTS: "current", PAYMENT: "upcoming", PAYMENT_REVIEW: "upcoming", EXECUTION: "upcoming", DELIVERY: "upcoming" }), request);
  assert.equal(journey.action.label, "رفع المستندات المطلوبة");
  // Documents fine, receipt rejected: the receipt is the task.
  const receipt = customerJourney(fixedSteps({ label: "x", RECEIVED: "done", DOCUMENTS: "done", PAYMENT: "current", PAYMENT_REVIEW: "upcoming", EXECUTION: "upcoming", DELIVERY: "upcoming" }), { ...request, checklist: [{ required: true, state: "ACCEPTED" }] });
  assert.equal(receipt.action.label, "رفع إيصال بديل");
  // A closed request offers nothing.
  assert.equal(customerJourney(fixedSteps({ label: "تم إغلاق الطلب", RECEIVED: "done", DOCUMENTS: "upcoming", PAYMENT: "upcoming", PAYMENT_REVIEW: "upcoming", EXECUTION: "upcoming", DELIVERY: "upcoming" }), { ...request, status: "CLOSED" }).action, null);
});

test("journey block keeps every server stage one tap away and escapes server text", async () => {
  const { journeyBlockHtml } = await import("../www/js/progress-view.js");
  const esc = (v) => String(v).replace(/</g, "&lt;");
  const html = journeyBlockHtml(fixedSteps({ label: "<b>x</b>", RECEIVED: "done", DOCUMENTS: "done", PAYMENT: "current", PAYMENT_REVIEW: "upcoming", EXECUTION: "upcoming", DELIVERY: "upcoming" }), esc, { status: "NEW", allowedActions: ["UPLOAD_RECEIPT"] });
  assert.match(html, /id="requestProgress"/, "full stage list inside «التفاصيل»");
  assert.match(html, /id="journeyActionBtn"/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.equal(journeyBlockHtml(null, esc), "");
});

test("customer journey: a receipt sent while documents are still reviewed shows payment in progress", async () => {
  const { customerJourney } = await import("../www/js/progress-view.js");
  const progress = fixedSteps({ label: "بانتظار مراجعة إثبات التحويل", RECEIVED: "done", DOCUMENTS: "current", PAYMENT: "done", PAYMENT_REVIEW: "upcoming", EXECUTION: "upcoming", DELIVERY: "upcoming" });
  progress.steps[3].status = "الإيصال قيد مراجعة الوكالة؛ لم يُقبل الدفع بعد.";
  const journey = customerJourney(progress, { status: "NEW", allowedActions: [] });
  const pay = journey.stages.find((s) => s.key === "PAY");
  assert.equal(pay.state, "current", "partly done = in progress, never «not started»");
  assert.equal(pay.detail, "الإيصال قيد مراجعة الوكالة؛ لم يُقبل الدفع بعد.");
  assert.equal(journey.stages.find((s) => s.key === "EXECUTION").state, "upcoming");
});
