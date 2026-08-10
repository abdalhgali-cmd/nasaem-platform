import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deriveCustomerFacingStatus } from "../src/modules/contact-requests/contact-request-status.js";

function baseRequest(overrides = {}) {
  return {
    status: "NEW",
    paymentStatus: "NOT_REQUIRED",
    passportImagePaths: [],
    guarantorIdImagePaths: [],
    additionalDocumentPaths: [],
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
    });
  });

  test("payment under review takes priority over document state", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ paymentStatus: "UNDER_REVIEW", passportImagePaths: ["a"] })
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
    });
  });

  test("documents present, no active payment flow: under review", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ additionalDocumentPaths: ["a"] }));
    assert.deepEqual(result, {
      label: "قيد المراجعة",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
    });
  });

  test("confirmed payment with documents already uploaded: under review, no outstanding needs", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ paymentStatus: "CONFIRMED", guarantorIdImagePaths: ["a"] })
    );
    assert.deepEqual(result, {
      label: "قيد المراجعة",
      needsDocuments: false,
      needsPayment: false,
      needsInvoiceApproval: false,
    });
  });

  test("a pending invoice takes priority over missing documents", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ hasPendingInvoice: true }));
    assert.deepEqual(result, {
      label: "بانتظار موافقتك على السعر",
      needsDocuments: true,
      needsPayment: false,
      needsInvoiceApproval: true,
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
    });
  });
});
