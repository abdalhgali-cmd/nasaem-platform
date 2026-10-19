import { test } from "node:test";
import assert from "node:assert/strict";
import { customerTodo, egyptFiles, egyptFilesHtml, egyptJourney, egyptPrepHtml } from "../www/js/egypt-journey.js";
import { customerJourney } from "../www/js/progress-view.js";
import { egyptStepsHtml } from "../www/js/egypt-view.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = () => "";
const timeline = (states) => ["RECEIVED", "PAYMENT_CONFIRMED", "APPROVAL_IN_PROGRESS", "APPROVAL_ISSUED", "TRAVEL_PREPARATION", "CIRCULAR_ISSUED"].map((key, i) => ({ key, label: key, state: states[i] }));

function request(egypt) {
  return {
    id: "r1",
    status: "NEW",
    allowedActions: ["SAVE_TRAVEL_PLAN"],
    egypt: {
      entryMode: "AIR",
      route: {},
      approval: { issued: false, files: [] },
      circular: { status: "NOT_STARTED", files: [] },
      tickets: [],
      travel: { travelDate: null, missing: [], preparationComplete: false, customerCanEdit: true },
      flight: { choice: null, inquiry: null },
      receipt: { available: false },
      timeline: timeline(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]),
      ...egypt,
    },
  };
}

test("issued approval: headline, the approval download, and what the customer still has to add", () => {
  const r = request({
    approval: { issued: true, issuedOn: "2026-10-18", files: [{ id: "a1" }] },
    receipt: { available: true, receiptNo: "NR-2026-000001" },
    travel: { travelDate: null, missing: [{ code: "TRAVEL_DATE_MISSING", message: "تاريخ السفر غير محدد." }], preparationComplete: false, customerCanEdit: true },
    timeline: timeline(["done", "done", "done", "done", "current", "upcoming"]),
  });
  const journey = egyptJourney(r, { fallbackHeadline: "x" });
  assert.equal(journey.headline, "تم إصدار الموافقة الأمنية");
  assert.equal(journey.action.target, "#egyptPrep");
  assert.match(journey.stages.find((s) => s.key === "TRAVEL_PREPARATION").detail, /مطلوب منك/);
  assert.deepEqual(egyptFiles(r).map((f) => f.label), ["تحميل إيصال السداد", "تحميل الموافقة"]);
  const html = egyptFilesHtml(r, esc, icon);
  assert.match(html, /تم إصدار الموافقة الأمنية/);
  assert.match(egyptPrepHtml(r, esc, { canEditPlan: true, canChooseFlight: true }), /هل ترغب في حجز تذكرة الطيران عبر نسائم الحرمين؟/);
});

test("before the approval there is no travel-preparation section and nothing asked of the customer", () => {
  const r = request({});
  assert.equal(egyptPrepHtml(r, esc), "");
  assert.deepEqual(customerTodo(r.egypt), []);
  assert.equal(egyptJourney(r).headline, "");
});

test("circular issued: its PDF and tickets from staff or the linked booking are separate downloads; a customer's own upload is not offered back", () => {
  const r = request({
    approval: { issued: true, files: [{ id: "a1" }] },
    circular: { status: "ISSUED", files: [{ id: "c1" }] },
    tickets: [{ source: "CUSTOMER", documentId: "d1" }, { source: "STAFF", deliverableId: "t1" }, { source: "LINKED_BOOKING", deliverableId: "t2", requestId: "child" }],
    travel: { travelDate: "2030-01-01", missing: [], preparationComplete: true, customerCanEdit: false },
    timeline: timeline(["done", "done", "done", "done", "done", "done"]),
  });
  const files = egyptFiles(r);
  assert.deepEqual(files.map((f) => f.label), ["تحميل الموافقة", "تحميل التعميم PDF", "تحميل التذكرة", "تحميل التذكرة"]);
  assert.equal(files[3].requestId, "child", "a linked booking's ticket is fetched from its own request");
  assert.equal(egyptJourney(r).headline, "تم إصدار التعميم");
  assert.match(egyptPrepHtml(r, esc), /صدر التعميم بهذه البيانات/);
});

test("the generic journey defers to the Egypt timeline, keeping a pending payment action first", () => {
  const r = { ...request({}), allowedActions: ["UPLOAD_RECEIPT"] };
  const progress = { label: "بانتظار تحويل المبلغ", steps: [{ key: "RECEIVED", label: "x", state: "done" }, { key: "PAYMENT", label: "y", state: "current" }] };
  const journey = customerJourney(progress, r);
  assert.equal(journey.stages.length, 6);
  assert.equal(journey.action.target, "#uploadReceiptBtn");
});

test("the three application steps mark done, current and upcoming", () => {
  const html = egyptStepsHtml(2);
  assert.match(html, /egypt-step-done[\s\S]*طريقة الدخول/);
  assert.match(html, /aria-current="step"[\s\S]*البيانات والجوازات/);
  assert.match(html, /egypt-step-upcoming[\s\S]*الدفع/);
});
