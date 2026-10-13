import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedPricing, fixedTotal, fixedTotalSummary, withServerPrice } from "../www/js/pricing-view.js";

const item = (overrides = {}) => ({ id: "v", name: "تأشيرة", basePrice: "150.00", currency: "USD", pricingMode: "FIXED", priceUnit: "PER_TRAVELER", paymentAfterDocumentReview: false, ...overrides });

test("only an explicitly FIXED item with a price is a fixed price", () => {
  assert.ok(fixedPricing(item()));
  assert.equal(fixedPricing(item({ pricingMode: "QUOTE" })), null, "basePrice alone is not a fixed price");
  assert.equal(fixedPricing(item({ pricingMode: undefined })), null, "older catalog responses stay QUOTE");
  assert.equal(fixedPricing(item({ basePrice: 0 })), null);
});

test("the total follows the price unit and the travelers", () => {
  const pricing = fixedPricing(item());
  assert.deepEqual(fixedTotal(pricing, 3), { units: 3, total: 450 });
  assert.deepEqual(fixedTotal(fixedPricing(item({ priceUnit: "PER_REQUEST" })), 3), { units: 1, total: 150 });
  const summary = fixedTotalSummary(pricing, 2);
  assert.equal(summary.total, 300);
  assert.match(summary.breakdown, /×/);
  assert.match(summary.payment, /تعليمات التحويل/);
  assert.match(fixedTotalSummary(fixedPricing(item({ paymentAfterDocumentReview: true })), 1).payment, /بعد اعتماد/);
});

test("a PRICE_CHANGED refusal updates the price for a new confirmation", () => {
  const updated = withServerPrice(item(), { unitPrice: 200, priceUnit: "PER_TRAVELER", total: 400, currency: "SAR" });
  assert.equal(fixedTotal(fixedPricing(updated), 2).total, 400);
  assert.equal(fixedPricing(updated).currency, "SAR", "review must display the updated currency before the customer re-confirms");
  assert.equal(withServerPrice(item(), null).basePrice, "150.00");
});

test("the SDG equivalent of a fixed total comes only from the agency's active rate", () => {
  const withRate = fixedTotalSummary(fixedPricing(item({ currency: "SAR", fxRateToSdg: 160, priceUnit: "PER_REQUEST", basePrice: "2500" })), 1);
  assert.match(withRate.sdgText, /SDG/);
  assert.match(withRate.sdgText, /المعتمد/);
  const noRate = fixedTotalSummary(fixedPricing(item({ currency: "SAR", fxRateToSdg: null })), 1);
  assert.match(noRate.sdgText, /غير متاح/, "no rate: never a guessed conversion");
  assert.equal(fixedTotalSummary(fixedPricing(item({ currency: "SDG", fxRateToSdg: null })), 1).sdgText, "");
  const repriced = withServerPrice(item({ currency: "SAR", fxRateToSdg: 160 }), { unitPrice: 50, currency: "USD", priceUnit: "PER_REQUEST" });
  assert.equal(fixedPricing(repriced).fxRateToSdg, null, "a rate for the old currency is dropped");
});
