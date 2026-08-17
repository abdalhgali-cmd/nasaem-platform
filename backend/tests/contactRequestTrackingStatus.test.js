import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deriveTrackingStatusLabel } from "../src/modules/contact-request-tracking/contact-request-tracking.status.js";

function baseRequest(overrides = {}) {
  return {
    status: "NEW",
    outcome: null,
    paymentStatus: "NOT_REQUIRED",
    invoice: null,
    offers: [],
    selectedOfferId: null,
    deliverables: [],
    ...overrides,
  };
}

describe("deriveTrackingStatusLabel", () => {
  test("NEW falls back to the plain status label", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest()),
      "تم استلام طلبك وهو قيد المراجعة"
    );
  });

  test("CONTACTED falls back to the plain status label", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ status: "CONTACTED" })),
      "تم التواصل معك بخصوص طلبك"
    );
  });

  test("CLOSED with no outcome (legacy data predating this field) uses the generic closed label", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ status: "CLOSED", outcome: null })),
      "تم إغلاق الطلب"
    );
  });

  test("CLOSED + COMPLETED", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ status: "CLOSED", outcome: "COMPLETED" })),
      "تم إنجاز طلبك بنجاح"
    );
  });

  test("CLOSED + REJECTED", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ status: "CLOSED", outcome: "REJECTED" })),
      "تم رفض الطلب"
    );
  });

  test("CLOSED + CANCELLED", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ status: "CLOSED", outcome: "CANCELLED" })),
      "تم إلغاء الطلب"
    );
  });

  test("CLOSED always wins over every other tier", () => {
    assert.equal(
      deriveTrackingStatusLabel(
        baseRequest({
          status: "CLOSED",
          outcome: "COMPLETED",
          paymentStatus: "CONFIRMED",
          deliverables: [{ id: "d1", label: "x" }],
        })
      ),
      "تم إنجاز طلبك بنجاح"
    );
  });

  test("delivered files outrank a merely-confirmed payment", () => {
    assert.equal(
      deriveTrackingStatusLabel(
        baseRequest({ paymentStatus: "CONFIRMED", deliverables: [{ id: "d1", label: "x" }] })
      ),
      "ملفاتك النهائية جاهزة للتحميل"
    );
  });

  test("payment progress outranks a still-pending invoice decision", () => {
    assert.equal(
      deriveTrackingStatusLabel(
        baseRequest({
          paymentStatus: "AWAITING_TRANSFER",
          invoice: { status: "PENDING" },
        })
      ),
      "تمت الموافقة على السعر، بانتظار تحويل المبلغ"
    );
  });

  test("a pending invoice", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ invoice: { status: "PENDING" } })),
      "يوجد عرض سعر بانتظار موافقتك"
    );
  });

  test("a rejected invoice", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ invoice: { status: "REJECTED" } })),
      "تم رفض عرض السعر، بانتظار عرض جديد من فريقنا"
    );
  });

  test("unselected offers", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ offers: [{ id: "o1" }], selectedOfferId: null })),
      "توجد عروض أسعار متعددة بانتظار اختيارك"
    );
  });

  test("a selected offer falls through to the bare status once nothing else applies", () => {
    assert.equal(
      deriveTrackingStatusLabel(baseRequest({ offers: [{ id: "o1" }], selectedOfferId: "o1" })),
      "تم استلام طلبك وهو قيد المراجعة"
    );
  });
});
