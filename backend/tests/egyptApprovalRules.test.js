import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { egyptTimeline, isApprovalIssued, reminderPlan, travelPreparation } from "../src/modules/egypt-clearance/egypt-approval-rules.js";

const egypt = (overrides = {}) => ({ status: "NEW", paymentStatus: "CONFIRMED", visaType: { code: "VISA-EGYPT-CLEARANCE-AIR" }, deliverables: [], documents: [], travelers: [], intakeData: {}, ...overrides });

describe("Egypt three-day reminder plan (Africa/Khartoum, UTC+2)", () => {
  test("three calendar days before, at 09:00 Khartoum", () => {
    const plan = reminderPlan("2026-11-10", new Date("2026-11-01T10:00:00Z"));
    assert.equal(plan.kind, "THREE_DAY");
    assert.equal(plan.dueAt.toISOString(), "2026-11-07T07:00:00.000Z");
  });

  test("the reminder day before 09:00 is still THREE_DAY; after it is URGENT now", () => {
    assert.equal(reminderPlan("2026-11-10", new Date("2026-11-07T06:59:00Z")).kind, "THREE_DAY");
    const late = reminderPlan("2026-11-10", new Date("2026-11-07T07:01:00Z"));
    assert.equal(late.kind, "URGENT");
    assert.equal(late.dueAt.toISOString(), "2026-11-07T07:01:00.000Z");
  });

  test("Khartoum midnight decides the calendar day, not UTC", () => {
    // 2026-11-07 23:30 UTC is already 2026-11-08 in Khartoum: two days left.
    const plan = reminderPlan("2026-11-10", new Date("2026-11-07T23:30:00Z"));
    assert.equal(plan.kind, "URGENT");
    assert.equal(plan.daysUntil, 2);
  });

  test("travel today is urgent; a past date or an invalid one has no reminder", () => {
    assert.equal(reminderPlan("2026-11-10", new Date("2026-11-10T05:00:00Z")).kind, "URGENT");
    assert.equal(reminderPlan("2026-11-09", new Date("2026-11-10T05:00:00Z")), null);
    assert.equal(reminderPlan("2026-02-30", new Date("2026-01-10T05:00:00Z")), null);
    assert.equal(reminderPlan("", new Date()), null);
  });
});

describe("Egypt approval rules", () => {
  test("only a current published APPROVAL is the approval", () => {
    const published = new Date();
    assert.equal(isApprovalIssued(egypt({ deliverables: [{ id: "c", kind: "CIRCULAR", publishedAt: published }] })), false);
    assert.equal(isApprovalIssued(egypt({ deliverables: [{ id: "t", kind: "TICKET", publishedAt: published }] })), false);
    assert.equal(isApprovalIssued(egypt({ deliverables: [{ id: "a", kind: "APPROVAL", publishedAt: null }] })), false, "a draft is not issued");
    assert.equal(isApprovalIssued(egypt({ deliverables: [{ id: "a", kind: "APPROVAL", publishedAt: published, supersededAt: published }] })), false, "a superseded file alone is not current");
    assert.equal(isApprovalIssued(egypt({ deliverables: [{ id: "a", kind: "APPROVAL", publishedAt: published }] })), true);
  });

  test("travel preparation: air needs date + ticket, overland needs crossing + date; never withdraws the approval", () => {
    const approved = { deliverables: [{ id: "a", kind: "APPROVAL", publishedAt: new Date() }] };
    const air = travelPreparation(egypt(approved));
    assert.deepEqual(air.missing.map((m) => m.code), ["TRAVEL_DATE_MISSING", "TICKET_MISSING"]);
    const overland = travelPreparation(egypt({ ...approved, visaType: { code: "VISA-EGYPT-CLEARANCE-BORDER" }, intakeData: { egyptRoute: { entryPort: "أرقين" } }, travelEntryDate: new Date("2030-01-01T00:00:00Z") }));
    assert.equal(overland.complete, true);
    const timeline = egyptTimeline(egypt(approved));
    assert.equal(timeline.find((s) => s.key === "APPROVAL_ISSUED").state, "done");
    assert.equal(timeline.find((s) => s.key === "TRAVEL_PREPARATION").state, "current");
  });

  test("the timeline has the seven customer steps in order", () => {
    assert.deepEqual(egyptTimeline(egypt({ paymentStatus: "AWAITING_TRANSFER" })).map((s) => [s.label, s.state]), [
      ["تم استلام الطلب", "done"],
      ["تم تأكيد الدفع", "current"],
      ["جاري إصدار الموافقة", "upcoming"],
      ["تم إصدار الموافقة", "upcoming"],
      ["تجهيز بيانات السفر", "upcoming"],
      ["جاري إصدار التعميم", "upcoming"],
      ["تم إصدار التعميم", "upcoming"],
    ]);
  });
});
