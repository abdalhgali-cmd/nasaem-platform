import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deriveRequestProgress, deriveServiceKind } from "../src/modules/contact-request-progress/request-progress.js";
import { deriveTrackingStatusLabel } from "../src/modules/contact-request-tracking/contact-request-tracking.status.js";

function req(overrides = {}) {
  return { status: "NEW", outcome: null, paymentStatus: "NOT_REQUIRED", invoice: null, offers: [], selectedOfferId: null, deliverables: [], executionStartedAt: null, ...overrides };
}

const KINDS = [
  [{ serviceRef: { category: "flight" } }, "FLIGHT", "جارٍ إصدار تذكرة الطيران"],
  [{ serviceRef: { category: "ferry" } }, "FERRY", "جارٍ إصدار تذكرة العبّارة"],
  [{ serviceRef: { category: "hotel" } }, "HOTEL", "جارٍ تأكيد حجز الفندق"],
  [{ serviceRef: { category: "umrah" } }, "UMRAH", "جارٍ استخراج تأشيرة العمرة"],
  [{ serviceRef: { category: "UMRAH_PACKAGE" } }, "UMRAH", "جارٍ استخراج تأشيرة العمرة"],
  [{ visaType: { code: "VISA-UMRAH", category: "UMRAH" } }, "UMRAH", "جارٍ استخراج تأشيرة العمرة"],
  [{ visaType: { code: "VISA-FAMILY-VISIT", category: "FAMILY_VISIT" } }, "FAMILY_VISIT", "جارٍ استخراج تأشيرة الزيارة العائلية"],
  [{ visaType: { code: "VISA-EGYPT-CLEARANCE", category: "OTHER" } }, "EGYPT_CLEARANCE", "جارٍ استخراج الموافقة الأمنية"],
  [{ visaType: { code: "VISA-ANY-NEW", category: "INTERNATIONAL" } }, "VISA", "جارٍ استخراج التأشيرة"],
  [{ serviceRef: { category: "tasheel" } }, "GENERAL", "جارٍ تنفيذ طلبك"],
  [{}, "GENERAL", "جارٍ تنفيذ طلبك"],
];

describe("service-specific request progress", () => {
  test("service kind comes from the configured visa type first, then the service category", () => {
    for (const [shape, kind] of KINDS) assert.equal(deriveServiceKind(shape), kind, JSON.stringify(shape));
    // a visa type hung off the flights service is still a visa
    assert.equal(deriveServiceKind({ serviceRef: { category: "flight" }, visaType: { code: "VISA-X", category: "OTHER" } }), "VISA");
  });

  test("accepted payment means only 'awaiting execution', for every service", () => {
    for (const [shape] of KINDS) {
      const progress = deriveRequestProgress(req({ ...shape, paymentStatus: "CONFIRMED", invoice: { status: "APPROVED" } }));
      assert.equal(progress.stage, "PAYMENT_ACCEPTED");
      assert.equal(progress.label, "تم قبول الدفع، بانتظار بدء التنفيذ");
      assert.equal(progress.canStartExecution, true);
      assert.equal(progress.steps.find((s) => s.key === "EXECUTION").state, "current");
      assert.doesNotMatch(progress.label, /التأشيرة|تذكرة|الفندق/);
    }
  });

  test("the service stage appears only once execution is recorded", () => {
    for (const [shape, , label] of KINDS) {
      const progress = deriveRequestProgress(req({ ...shape, paymentStatus: "CONFIRMED", executionStartedAt: new Date() }));
      assert.equal(progress.stage, "IN_EXECUTION");
      assert.equal(progress.label, label);
      assert.equal(progress.canStartExecution, false);
      assert.equal(progress.steps.find((s) => s.key === "EXECUTION").state, "done");
      assert.equal(progress.steps.find((s) => s.key === "DELIVERY").state, "current");
    }
  });

  test("a recorded execution without an accepted payment is never shown", () => {
    const progress = deriveRequestProgress(req({ serviceRef: { category: "flight" }, paymentStatus: "UNDER_REVIEW", executionStartedAt: new Date() }));
    assert.equal(progress.stage, "PAYMENT_REVIEW");
  });

  test("the tracking label is the progress label", () => {
    const shape = req({ serviceRef: { category: "hotel" }, paymentStatus: "CONFIRMED", executionStartedAt: new Date() });
    assert.equal(deriveTrackingStatusLabel(shape), "جارٍ تأكيد حجز الفندق");
    assert.equal(deriveTrackingStatusLabel(req({ paymentStatus: "CONFIRMED" })), "تم قبول الدفع، بانتظار بدء التنفيذ");
  });

  test("delivery and closure", () => {
    const delivered = deriveRequestProgress(req({ serviceRef: { category: "ferry" }, paymentStatus: "CONFIRMED", deliverables: [{ id: "d" }] }));
    assert.equal(delivered.stage, "DELIVERED");
    assert.equal(delivered.canStartExecution, false);
    const completed = deriveRequestProgress(req({ status: "CLOSED", outcome: "COMPLETED", paymentStatus: "CONFIRMED", deliverables: [{ id: "d" }] }));
    assert.ok(completed.steps.every((s) => s.state === "done"));
    const cancelled = deriveRequestProgress(req({ status: "CLOSED", outcome: "CANCELLED", paymentStatus: "CONFIRMED" }));
    assert.equal(cancelled.label, "تم إلغاء الطلب");
    assert.equal(cancelled.canStartExecution, false);
    assert.ok(cancelled.steps.every((s) => s.state !== "current"));
  });
});
