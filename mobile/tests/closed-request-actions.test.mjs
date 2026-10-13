import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentActions } from "../www/js/payment-view.js";

// Review finding: a closed request with a pending price still offered
// "approve", and one awaiting transfer still offered "pay".
test("a closed or cancelled request offers no approval or payment action", () => {
  for (const outcome of ["CANCELLED", "REJECTED", "COMPLETED", null]) {
    const pendingPrice = paymentActions({ status: "CLOSED", outcome, paymentStatus: "NOT_REQUIRED", invoice: { status: "PENDING", amount: 10, currency: "USD" } });
    assert.equal(pendingPrice.canApprove, false, `approve on CLOSED/${outcome}`);
    const awaiting = paymentActions({ status: "CLOSED", outcome, paymentStatus: "AWAITING_TRANSFER", invoice: { status: "APPROVED", amount: 10, currency: "USD" } });
    assert.equal(awaiting.canPay, false, `pay on CLOSED/${outcome}`);
  }
});

test("the server's allowed actions win over local guesses", () => {
  const request = { status: "CONTACTED", paymentStatus: "AWAITING_TRANSFER", invoice: { status: "APPROVED", amount: 10, currency: "USD" } };
  assert.equal(paymentActions(request).canPay, true);
  assert.equal(paymentActions({ ...request, allowedActions: [] }).canPay, false);
  assert.equal(paymentActions({ ...request, allowedActions: ["UPLOAD_RECEIPT"] }).canPay, true);
  const pending = { status: "NEW", paymentStatus: "NOT_REQUIRED", invoice: { status: "PENDING", amount: 10, currency: "USD" } };
  assert.equal(paymentActions({ ...pending, allowedActions: ["APPROVE_QUOTE", "REJECT_QUOTE"] }).canApprove, true);
  assert.equal(paymentActions({ ...pending, allowedActions: [] }).canApprove, false);
});

test("a closed request offers no document upload, even for a rejected document", async () => {
  const { canUpload } = await import("../www/js/checklist-view.js");
  const rejected = { kind: "DOCUMENT", state: "REJECTED" };
  assert.equal(canUpload(rejected, { status: "CONTACTED" }), true);
  assert.equal(canUpload(rejected, { status: "CLOSED" }), false);
  assert.equal(canUpload(rejected, { status: "CONTACTED", allowedActions: [] }), false);
  assert.equal(canUpload(rejected), true, "no request context: unchanged behavior");
});
