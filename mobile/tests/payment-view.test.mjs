import { test } from "node:test";
import assert from "node:assert/strict";
import { pricingOf, paymentState, paymentActions, sdgEquivalent, formatAmount } from "../www/js/payment-view.js";

const invoice = (over = {}) => ({ id: "i1", amount: "1000", currency: "SAR", amountSdg: "160000", exchangeRateToSdg: "160", status: "PENDING", ...over });

test("price keeps its original currency; the SDG figure is the frozen one and is labelled as such", () => {
  const pricing = pricingOf({ invoice: invoice() });
  assert.equal(pricing.currency, "SAR");
  assert.equal(pricing.amount, 1000);
  assert.match(sdgEquivalent(pricing), /160/);
  assert.match(sdgEquivalent(pricing), /وقت إصدار السعر/);
  assert.equal(sdgEquivalent(pricingOf({ invoice: invoice({ currency: "SDG", amountSdg: null }) })), "");
  assert.equal(sdgEquivalent(pricingOf({ invoice: invoice({ amountSdg: null, exchangeRateToSdg: null }) })), "", "no frozen rate -> nothing is invented");
  assert.equal(formatAmount("1500.5", "USD").includes("USD"), true);
});

test("a selected offer is the price of the request", () => {
  const pricing = pricingOf({ offers: [{ id: "o1", amount: 300, currency: "USD", carrier: "ناقل" }], selectedOfferId: "o1" });
  assert.equal(pricing.kind, "offer");
  assert.equal(pricing.currency, "USD");
  assert.equal(pricingOf({ offers: [{ id: "o1", amount: 300, currency: "USD" }] }), null);
});

test("payment details are offered only after the price is approved", () => {
  assert.equal(paymentActions({ invoice: invoice(), paymentStatus: "NOT_REQUIRED" }).canPay, false);
  assert.equal(paymentActions({ invoice: invoice(), paymentStatus: "NOT_REQUIRED" }).canApprove, true);
  const approved = paymentActions({ invoice: invoice({ status: "APPROVED" }), paymentStatus: "AWAITING_TRANSFER" });
  assert.equal(approved.canPay, true);
  assert.equal(approved.canApprove, false);
  assert.equal(paymentActions({ offers: [{ id: "o1", amount: 1, currency: "SAR" }], paymentStatus: "NOT_REQUIRED" }).canPay, false);
  assert.equal(paymentActions({ offers: [{ id: "o1", amount: 1, currency: "SAR" }], selectedOfferId: "o1", paymentStatus: "AWAITING_TRANSFER" }).canPay, true);
});

test("an uploaded receipt is 'under review', never 'paid'; only the agency's confirmation says paid", () => {
  const review = paymentState({ invoice: invoice({ status: "APPROVED" }), paymentStatus: "UNDER_REVIEW" });
  assert.equal(review.key, "UNDER_REVIEW");
  assert.match(review.detail, /لم يُعتمد/);
  assert.equal(paymentActions({ invoice: invoice({ status: "APPROVED" }), paymentStatus: "UNDER_REVIEW" }).canPay, false);
  assert.equal(paymentState({ invoice: invoice({ status: "APPROVED" }), paymentStatus: "CONFIRMED" }).key, "CONFIRMED");
});

test("a rejected receipt shows the agency's reason and allows a new upload", () => {
  const request = { invoice: invoice({ status: "APPROVED" }), paymentStatus: "AWAITING_TRANSFER", paymentRejection: { reason: "المبلغ غير مطابق" } };
  const state = paymentState(request);
  assert.equal(state.key, "RECEIPT_REJECTED");
  assert.equal(state.tone, "bad");
  assert.match(state.detail, /المبلغ غير مطابق/);
  assert.equal(paymentActions(request).canPay, true);
});

test("states before any payment", () => {
  assert.equal(paymentState({ paymentStatus: "NOT_REQUIRED" }).key, "NO_PRICE");
  assert.equal(paymentState({ invoice: invoice(), paymentStatus: "NOT_REQUIRED" }).key, "PRICE_PENDING_APPROVAL");
  assert.equal(paymentState({ invoice: invoice({ status: "REJECTED" }), paymentStatus: "NOT_REQUIRED" }).key, "PRICE_REJECTED");
  assert.equal(paymentState({ offers: [{ id: "o", amount: 1, currency: "SAR" }], paymentStatus: "NOT_REQUIRED" }).key, "OFFERS_PENDING");
});
