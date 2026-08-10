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
    assert.deepEqual(result, { label: "مكتمل", needsDocuments: false, needsPayment: false });
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
    assert.deepEqual(result, { label: "بانتظار المستندات", needsDocuments: true, needsPayment: false });
  });

  test("documents present, no active payment flow: under review", () => {
    const result = deriveCustomerFacingStatus(baseRequest({ additionalDocumentPaths: ["a"] }));
    assert.deepEqual(result, { label: "قيد المراجعة", needsDocuments: false, needsPayment: false });
  });

  test("confirmed payment with documents already uploaded: under review, no outstanding needs", () => {
    const result = deriveCustomerFacingStatus(
      baseRequest({ paymentStatus: "CONFIRMED", guarantorIdImagePaths: ["a"] })
    );
    assert.deepEqual(result, { label: "قيد المراجعة", needsDocuments: false, needsPayment: false });
  });
});
