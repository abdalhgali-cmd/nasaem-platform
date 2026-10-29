import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { umrahStaffQueue } from "../src/modules/umrah/umrah-staff-queue.js";

// Pure rules: the next staff step on an Umrah request and its queue rank.
const base = { status: "NEW", travelerCount: 1, travelers: [{ id: "t1", fullName: "معتمر" }], documents: [], intakeData: {} };
const progress = (stage, extra = {}) => ({ serviceKind: "UMRAH", stage, steps: [{ key: "EXECUTION", label: "جارٍ إصدار التأشيرة" }], blockers: [], canStartExecution: true, ...extra });

describe("Umrah staff next step", () => {
  test("other services get nothing", () => {
    assert.equal(umrahStaffQueue(base, { serviceKind: "EGYPT_CLEARANCE", stage: "PAYMENT_REVIEW" }), null);
    assert.equal(umrahStaffQueue(base, null), null);
  });

  test("a receipt under review comes first", () => {
    assert.deepEqual(umrahStaffQueue(base, progress("PAYMENT_REVIEW")), { nextAction: "مراجعة إيصال الدفع وتأكيده", rank: 0, preferredTravelDate: null });
  });

  test("a missing guarantor phone is asked for before execution", () => {
    const request = { ...base, intakeData: { umrahContacts: { guarantorPhoneMissing: true } } };
    assert.equal(umrahStaffQueue(request, progress("PAYMENT_ACCEPTED")).nextAction, "طلب رقم هاتف الضامن من العميل");
  });

  test("paid: start the service's own execution step, or say what blocks it", () => {
    assert.deepEqual(umrahStaffQueue(base, progress("PAYMENT_ACCEPTED")), { nextAction: "بدء جارٍ إصدار التأشيرة", rank: 2, preferredTravelDate: null });
    const blocked = progress("PAYMENT_ACCEPTED", { canStartExecution: false, blockers: [{ message: "مستندات مرفوضة" }] });
    assert.deepEqual(umrahStaffQueue(base, blocked), { nextAction: "مستندات مرفوضة", rank: 3, preferredTravelDate: null });
  });

  test("a missing preferred travel date (older app) is asked for; a given one is returned for sorting", () => {
    const missing = { ...base, intakeData: { umrahTravel: { preferredDateMissing: true } } };
    assert.equal(umrahStaffQueue(missing, progress("AWAITING_PAYMENT")).nextAction, "طلب تاريخ السفر المفضل من العميل");
    const given = { ...base, intakeData: { umrahTravel: { preferredDate: "2026-12-01", provisional: true } } };
    assert.equal(umrahStaffQueue(given, progress("IN_EXECUTION")).preferredTravelDate, "2026-12-01");
  });

  test("execution, delivery, waiting on the customer, closed", () => {
    assert.equal(umrahStaffQueue(base, progress("IN_EXECUTION")).nextAction, "رفع الملفات النهائية لكل معتمر");
    assert.equal(umrahStaffQueue(base, progress("DELIVERED")).nextAction, "إغلاق الطلب بعد التسليم");
    assert.equal(umrahStaffQueue(base, progress("AWAITING_PAYMENT")).rank, 6);
    assert.equal(umrahStaffQueue({ ...base, status: "CLOSED" }, progress("CLOSED")).rank, 9);
  });
});
