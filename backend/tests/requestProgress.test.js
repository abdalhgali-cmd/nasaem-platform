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
  [{ serviceRef: { category: "umrah" } }, "UMRAH", "جارٍ إصدار التأشيرة"],
  [{ serviceRef: { category: "UMRAH_PACKAGE" } }, "UMRAH", "جارٍ إصدار التأشيرة"],
  [{ visaType: { code: "VISA-UMRAH", category: "UMRAH" } }, "UMRAH", "جارٍ إصدار التأشيرة"],
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
      assert.deepEqual(progress.blockers, []);
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
      // started is not finished: execution stays the current step
      assert.equal(progress.steps.find((s) => s.key === "EXECUTION").state, "current");
      assert.equal(progress.steps.find((s) => s.key === "DELIVERY").state, "upcoming");
    }
  });

  test("received is not reviewed; a receipt is not an accepted payment", () => {
    const snapshot = [{ id: "r1", name: "الجواز", required: true, type: "DOCUMENT", scope: "TRAVELER" }];
    const travelers = [{ id: "t1", fullName: "أ" }, { id: "t2", fullName: "ب" }];
    const fresh = deriveRequestProgress(req({ requirementsSnapshot: snapshot, travelers, documents: [{ id: "x", requirementId: "r1", travelerId: "t1", status: "PENDING" }] }));
    assert.equal(fresh.steps.find((s) => s.key === "RECEIVED").state, "done");
    assert.equal(fresh.steps.find((s) => s.key === "DOCUMENTS").state, "current");
    const receipt = deriveRequestProgress(req({ paymentStatus: "UNDER_REVIEW", invoice: { status: "APPROVED" } }));
    // Uploading the receipt completes the customer's part (PAYMENT); the
    // payment itself is accepted only by staff (PAYMENT_REVIEW stays current).
    assert.equal(receipt.steps.find((s) => s.key === "PAYMENT").state, "done");
    assert.equal(receipt.steps.find((s) => s.key === "PAYMENT_REVIEW").state, "current");
    assert.match(receipt.steps.find((s) => s.key === "PAYMENT_REVIEW").status, /لم يُقبل الدفع بعد/);
    const paidButMissing = deriveRequestProgress(req({ requirementsSnapshot: snapshot, travelers, paymentStatus: "CONFIRMED", invoice: { status: "APPROVED" }, documents: [{ id: "x", requirementId: "r1", travelerId: "t1", status: "ACCEPTED" }] }));
    assert.equal(paidButMissing.canStartExecution, false);
    assert.ok(paidButMissing.blockers.some((b) => b.code === "DOCUMENTS_MISSING" && b.message.includes("ب")));
  });

  test("partial delivery to a group: execution done, delivery current, not delivered", () => {
    const travelers = [{ id: "t1", fullName: "أ" }, { id: "t2", fullName: "ب" }];
    const partial = deriveRequestProgress(req({ travelers, paymentStatus: "CONFIRMED", invoice: { status: "APPROVED" }, executionStartedAt: new Date(), deliverables: [{ id: "d", publishedAt: new Date(), travelerIds: ["t1"] }] }));
    assert.equal(partial.stage, "IN_EXECUTION");
    assert.equal(partial.steps.find((s) => s.key === "DELIVERY").state, "current");
    assert.deepEqual(partial.delivery.missingTravelerIds, ["t2"]);
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
    const draftOnly = deriveRequestProgress(req({ serviceRef: { category: "ferry" }, paymentStatus: "CONFIRMED", executionStartedAt: new Date(), deliverables: [{ id: "d", publishedAt: null }] }));
    assert.equal(draftOnly.stage, "IN_EXECUTION", "a prepared file is not delivery");
    // Egypt: only the typed APPROVAL file is its delivery; a circular or a
    // ticket published alone is not.
    for (const kind of ["CIRCULAR", "TICKET", "GENERAL"]) {
      const other = deriveRequestProgress(req({ visaType: { code: "VISA-EGYPT-CLEARANCE" }, paymentStatus: "CONFIRMED", executionStartedAt: new Date(), deliverables: [{ id: "c", kind, publishedAt: new Date() }] }));
      assert.equal(other.stage, "IN_EXECUTION", `${kind} is not the approval`);
    }
    const delivered = deriveRequestProgress(req({ visaType: { code: "VISA-EGYPT-CLEARANCE" }, paymentStatus: "CONFIRMED", executionStartedAt: new Date(), deliverables: [{ id: "d", kind: "APPROVAL", publishedAt: new Date() }] }));
    assert.equal(delivered.stage, "DELIVERED");
    assert.equal(delivered.canStartExecution, false);
    // Egypt: the approval is delivered, the travel plan is still owed
    assert.ok(delivered.steps.filter((s) => s.key !== "TRAVEL_PLAN").every((s) => s.state === "done"));
    assert.equal(delivered.steps.find((s) => s.key === "TRAVEL_PLAN").state, "current");
    assert.ok(delivered.completionBlockers.some((b) => b.code === "TRAVEL_PLAN_MISSING"));
    const planned = { visaType: { code: "VISA-EGYPT-CLEARANCE" }, paymentStatus: "CONFIRMED", invoice: { status: "APPROVED" }, executionStartedAt: new Date(), intakeData: { egyptTravel: { entryMode: "AIR", bookingStatus: "NEEDS_NASAEM", entryDate: "2030-01-01" } }, tasks: [] };
    const noCircular = deriveRequestProgress(req({ ...planned, deliverables: [{ id: "d", kind: "APPROVAL", publishedAt: new Date() }] }));
    assert.deepEqual(noCircular.completionBlockers.map((b) => b.code), ["CIRCULAR_NOT_ISSUED"]);
    const withPlan = deriveRequestProgress(req({ ...planned, deliverables: [{ id: "d", kind: "APPROVAL", publishedAt: new Date() }, { id: "c", kind: "CIRCULAR", publishedAt: new Date() }] }));
    assert.ok(withPlan.steps.every((s) => s.state === "done"));
    assert.deepEqual(withPlan.completionBlockers, []);
    const completed = deriveRequestProgress(req({ status: "CLOSED", outcome: "COMPLETED", paymentStatus: "CONFIRMED", deliverables: [{ id: "d", publishedAt: new Date() }] }));
    assert.ok(completed.steps.every((s) => s.state === "done"));
    const cancelled = deriveRequestProgress(req({ status: "CLOSED", outcome: "CANCELLED", paymentStatus: "CONFIRMED" }));
    assert.equal(cancelled.label, "تم إلغاء الطلب");
    assert.equal(cancelled.canStartExecution, false);
    assert.ok(cancelled.steps.every((s) => s.state !== "current"));
    assert.notEqual(cancelled.steps.find((s) => s.key === "DELIVERY").state, "done", "a cancelled request never shows as delivered");
    assert.notEqual(cancelled.steps.find((s) => s.key === "EXECUTION").state, "done");
  });
});
