import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deriveCustomerFacingStatus } from "../src/modules/contact-requests/contact-request-status.js";

function baseRequest(overrides = {}) {
  return {
    status: "NEW",
    paymentStatus: "NOT_REQUIRED",
    documents: [],
    ...overrides,
  };
}

let docCounter = 0;
function doc(type, status, overrides = {}) {
  docCounter += 1;
  const createdAt = overrides.createdAt ?? new Date(2026, 0, docCounter);
  return {
    id: `doc-${docCounter}`,
    type,
    status,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("deriveCustomerFacingStatus", () => {
  test("CLOSED always reads as completed, regardless of payment state", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ status: "CLOSED", paymentStatus: "AWAITING_TRANSFER" }));
    assert.deepEqual(result, {
      label: "مكتمل",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });

  test("payment under review takes priority over document state", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ paymentStatus: "UNDER_REVIEW", documents: [doc("PASSPORT", "ACCEPTED")] })
    );
    assert.equal(result.label, "قيد المراجعة");
  });

  test("awaiting transfer with zero documents: label is payment, but needsDocuments stays true", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ paymentStatus: "AWAITING_TRANSFER" }));
    assert.equal(result.label, "بانتظار الدفع");
    assert.equal(result.needsDocuments, true);
    assert.equal(result.needsPayment, true);
  });

  test("no documents yet, no active payment flow: waiting on documents", () => {
    const result = deriveCustomerFacingStatus(baseRequest());
    assert.deepEqual(result, {
      label: "بانتظار المستندات",
      needsDocuments: true,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });

  test("documents present, no active payment flow: under review", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ documents: [doc("ADDITIONAL", "PENDING")] }));
    assert.deepEqual(result, {
      label: "قيد المراجعة",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });

  test("confirmed payment with documents already uploaded: under review, no outstanding needs", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ paymentStatus: "CONFIRMED", documents: [doc("GUARANTOR_ID", "ACCEPTED")] })
    );
    assert.deepEqual(result, {
      label: "قيد المراجعة",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });

  test("a pending invoice takes priority over missing documents", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ hasPendingInvoice: true }));
    assert.deepEqual(result, {
      label: "بانتظار موافقتك على السعر",
      needsDocuments: true,
      needsPayment: false,
      needsInvoiceApproval: true,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });

  test("a pending invoice loses to an already-active payment flow", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ hasPendingInvoice: true, paymentStatus: "AWAITING_TRANSFER" })
    );
    assert.equal(result.label, "بانتظار الدفع");
  });

  test("a pending invoice is moot once the request is CLOSED", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ hasPendingInvoice: true, status: "CLOSED" }));
    assert.deepEqual(result, {
      label: "مكتمل",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });

  test("a rejected document with no later re-upload of the same type needs re-upload", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ documents: [doc("PASSPORT", "REJECTED", { rejectionReason: "صورة غير واضحة" })] })
    );
    assert.equal(result.needsReupload, true);
    assert.equal(result.label, "يوجد مستند يحتاج إعادة رفع");
  });

  test("a rejected document superseded by a later same-type upload no longer needs re-upload", () => {
    const rejected = doc("PASSPORT", "REJECTED", { createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) });
    const reupload = doc("PASSPORT", "PENDING", { createdAt: new Date(2026, 0, 2) });
    const result = deriveCustomerFacingStatus(baseRequest({ documents: [rejected, reupload] }));
    assert.equal(result.needsReupload, false);
    assert.equal(result.label, "قيد المراجعة");
  });

  test("one accepted and one rejected document of the same type, no later upload: still needs re-upload", () => {
    const accepted = doc("ADDITIONAL", "ACCEPTED", { createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) });
    const rejected = doc("ADDITIONAL", "REJECTED", { createdAt: new Date(2026, 0, 2), updatedAt: new Date(2026, 0, 2) });
    const result = deriveCustomerFacingStatus(baseRequest({ documents: [accepted, rejected] }));
    assert.equal(result.needsReupload, true);
  });

  test("needsReupload outranks an awaiting-payment or pending-invoice state", () => {
    const rejected = doc("GUARANTOR_ID", "REJECTED");
    const result = deriveCustomerFacingStatus(
      baseRequest({ documents: [rejected], paymentStatus: "AWAITING_TRANSFER", hasPendingInvoice: true })
    );
    assert.equal(result.label, "يوجد مستند يحتاج إعادة رفع");
  });

  test("a rejected document on a CLOSED request does not need re-upload", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ status: "CLOSED", documents: [doc("PASSPORT", "REJECTED")] }));
    assert.equal(result.needsReupload, false);
    assert.equal(result.label, "مكتمل");
  });

  test("pending offers take priority over missing documents", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ hasPendingOffers: true }));
    assert.deepEqual(result, {
      label: "بانتظار موافقتك على السعر",
      needsDocuments: true,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: true,
      needsReupload: false,
    });
  });

  test("pending offers lose to an already-active payment flow", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ hasPendingOffers: true, paymentStatus: "AWAITING_TRANSFER" }));
    assert.equal(result.label, "بانتظار الدفع");
  });

  test("pending offers are moot once the request is CLOSED", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ hasPendingOffers: true, status: "CLOSED" }));
    assert.deepEqual(result, {
      label: "مكتمل",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
      needsOfferApproval: false,
      needsReupload: false,
    });
  });
});
