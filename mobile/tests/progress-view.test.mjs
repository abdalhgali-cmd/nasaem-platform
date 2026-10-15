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
