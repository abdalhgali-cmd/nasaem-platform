import { test } from "node:test";
import assert from "node:assert/strict";
import { UMRAH_ACTION_TARGETS, bindUmrahJourney, umrahJourneyHtml } from "../www/js/umrah-journey-view.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = () => "";
const NO_ACTION = "لا يوجد إجراء مطلوب منك حالياً. سنُحدّث حالة طلبك عند اكتمال الخطوة التالية.";
const LABELS = ["تقديم الطلب", "مراجعة المستندات", "تأكيد الدفع", "إجراءات التأشيرة", "إصدار التأشيرات", "تسليم الخدمات المشمولة", "اكتمال الرحلة"];

function journey(overrides = {}) {
  return {
    title: "رحلتي إلى الحرمين",
    reference: "cmref123",
    packageKind: "AIR",
    packageLabel: "عمرة بالطيران",
    pilgrimCount: 2,
    status: "جارٍ إصدار التأشيرة",
    updatedAt: "2026-11-02T10:00:00.000Z",
    servicesIncluded: true,
    visasIssued: 1,
    servicesDelivered: 0,
    stages: LABELS.map((label, i) => ({ key: `S${i}`, label, state: i < 4 ? "done" : i === 4 ? "current" : "upcoming", status: i === 4 ? "صدرت 1 من 2 تأشيرات" : "" })),
    pilgrims: [
      { id: "t1", name: "المعتمر الأول", visa: "ISSUED", visaFiles: [{ id: "d1", label: "تأشيرة الأول" }], services: "PREPARING", serviceFiles: [] },
      { id: "t2", name: "المعتمر <الثاني>", visa: "IN_PROGRESS", visaFiles: [], services: "PREPARING", serviceFiles: [] },
    ],
    now: { stepKey: "VISAS", stepLabel: "إصدار التأشيرات", actor: "AGENCY", actionRequired: false, message: "x", noActionMessage: NO_ACTION, nextStepLabel: "تسليم الخدمات المشمولة" },
    primaryAction: { key: "DOWNLOAD_VISAS", label: "تحميل التأشيرة" },
    ...overrides,
  };
}

test("optional tickets: only server-authorized actions are offered; an existing inquiry cannot be sent again", () => {
  assert.doesNotMatch(umrahJourneyHtml(journey(), esc, icon), /umrahTicketsBtn/);
  assert.match(umrahJourneyHtml(journey({ ticketBooking: { available: true, mode: "SEA" } }), esc, icon), /طلب حجز تذاكر البحر/);
  const sent = umrahJourneyHtml(journey({ ticketBooking: { available: false, inquiryId: "inquiry-1", mode: "AIR" } }), esc, icon);
  assert.match(sent, /inquiry-1/);
  assert.doesNotMatch(sent, /umrahTicketsBtn/);
});

test("the four sections: facts, seven stages, what happens now, the action", () => {
  const html = umrahJourneyHtml(journey(), esc, icon);
  for (const text of ["رحلتي إلى الحرمين", "cmref123", "عمرة بالطيران", "عدد المعتمرين", "آخر تحديث", "ماذا يحدث الآن؟", "الخطوة التالية", "تسليم الخدمات المشمولة"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/class="umrah-stage /g) || []).length, 7);
  assert.ok(html.includes('aria-current="step"'));
  assert.ok(html.includes(NO_ACTION), "the exact no-action text");
  assert.ok(html.includes('id="umrahActionBtn"') && html.includes("تحميل التأشيرة"));
});

test("per pilgrim: visa and services state, only that pilgrim's files; names escaped", () => {
  const html = umrahJourneyHtml(journey(), esc, icon);
  assert.ok(html.includes("صدرت التأشيرة") && html.includes("قيد الإجراءات") && html.includes("قيد التجهيز"));
  assert.equal((html.match(/data-id="d1"/g) || []).length, 1);
  assert.ok(html.includes("صدرت 1 من 2 تأشيرات"));
  assert.ok(!html.includes("<الثاني>") && html.includes("&lt;الثاني&gt;"));
});

test("customer action: the message, «نعم», and the mapped control", () => {
  const html = umrahJourneyHtml(journey({ now: { stepKey: "PAYMENT", stepLabel: "تأكيد الدفع", actor: "CUSTOMER", actionRequired: true, message: "رُفض الإيصال السابق: المبلغ ناقص", noActionMessage: null }, primaryAction: { key: "REUPLOAD_RECEIPT", label: "رفع إيصال بديل" } }), esc, icon);
  assert.ok(html.includes("رُفض الإيصال السابق: المبلغ ناقص"));
  assert.ok(html.includes("مطلوب منك"));
  assert.ok(html.includes(`data-progress-target="${UMRAH_ACTION_TARGETS.REUPLOAD_RECEIPT.target}"`));
  assert.ok(!html.includes(NO_ACTION));
});

test("no action → no button; an unknown action key is never rendered", () => {
  assert.ok(!umrahJourneyHtml(journey({ primaryAction: null }), esc, icon).includes("umrahActionBtn"));
  assert.ok(!umrahJourneyHtml(journey({ primaryAction: { key: "BOOK_FLIGHT", label: "احجز" } }), esc, icon).includes("umrahActionBtn"));
});

test("visa only: services stage shown as not included, no service badges", () => {
  const stages = LABELS.map((label, i) => ({ key: `S${i}`, label, state: i === 5 ? "not_included" : "upcoming", status: "" }));
  const html = umrahJourneyHtml(journey({ servicesIncluded: false, servicesDelivered: null, stages, pilgrims: [{ id: "t1", name: "أ", visa: "PENDING", visaFiles: [] }] }), esc, icon);
  assert.ok(html.includes("غير مشمولة في باقتك"));
  assert.ok(!html.includes("سُلّمت الخدمات") && !html.includes("قيد التجهيز"));
});

test("the button is removed when its control is not on the screen", () => {
  let removed = false;
  let bound = false;
  const button = { dataset: { progressTarget: "#uploadReceiptBtn" }, remove: () => { removed = true; }, addEventListener: () => { bound = true; } };
  bindUmrahJourney({ querySelector: (sel) => (sel === "#umrahActionBtn" ? button : null) }, () => {});
  assert.ok(removed && !bound);
  removed = false;
  bindUmrahJourney({ querySelector: (sel) => (sel === "#umrahActionBtn" ? button : {}) }, () => {});
  assert.ok(!removed && bound);
});

test("delayed and rejected pilgrims show their reason, the follow-up day and that the request stays open; escaped", () => {
  const html = umrahJourneyHtml(journey({
    pilgrims: [
      { id: "t1", name: "أ", visa: "DELAYED", visaReason: "بانتظار <السفارة>", visaFollowUpAt: "2026-11-20T00:00:00.000Z", visaFiles: [] },
      { id: "t2", name: "ب", visa: "REJECTED", visaReason: "بيانات غير مطابقة", visaFiles: [] },
    ],
  }), esc, icon);
  assert.ok(html.includes("تأشيرة متأخرة") && html.includes("تأشيرة مرفوضة"));
  assert.ok(html.includes("المتابعة القادمة") && html.includes("2026-11-20"));
  assert.ok(html.includes("بيانات غير مطابقة"));
  assert.ok(html.includes("لا يُغلق الطلب قبل ذلك"));
  assert.ok(!html.includes("<السفارة>") && html.includes("&lt;السفارة&gt;"));
  assert.equal((html.match(/المتابعة القادمة/g) || []).length, 1, "a follow-up day is shown for the delayed pilgrim only");
});
