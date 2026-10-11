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

test("the progress block renders the server's stages and nothing else", () => {
  const html = progressBlockHtml(paidAwaiting, esc);
  assert.match(html, /تم قبول الدفع، بانتظار بدء التنفيذ/);
  assert.match(html, /progress-step-current" aria-current="step"><span class="progress-dot" aria-hidden="true"><\/span><span>تأكيد الحجز مع الفندق/);
  assert.match(html, /حجز الفنادق/);
  assert.equal(progressBlockHtml(null, esc), "");
  assert.equal(progressBlockHtml({ steps: [] }, esc), "");
  assert.deepEqual(progressSteps({ steps: [{ key: "X", label: "x", state: "weird" }] }), [{ key: "X", label: "x", state: "upcoming" }]);
  assert.doesNotMatch(progressBlockHtml({ ...paidAwaiting, label: "<img src=x>" }, esc), /<img/);
});

test("an accepted payment says 'awaiting execution' until the agency records execution", () => {
  assert.match(paymentState({ paymentStatus: "CONFIRMED", progress: paidAwaiting }).detail, /بانتظار بدء التنفيذ/);
  assert.match(paymentState({ paymentStatus: "CONFIRMED" }).detail, /بانتظار بدء التنفيذ/);
  const executing = paymentState({ paymentStatus: "CONFIRMED", progress: { ...paidAwaiting, stage: "IN_EXECUTION" } });
  assert.doesNotMatch(executing.detail, /بانتظار بدء التنفيذ/);
  assert.doesNotMatch(paymentState({ paymentStatus: "CONFIRMED" }).detail, /التأشيرة|تذكرة|الفندق/);
});
