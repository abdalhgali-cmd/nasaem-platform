import { test } from "node:test";
import assert from "node:assert/strict";
import { findFreshPricedItem, assessLiveFixedPrice } from "../www/js/live-price-check.js";

const packageItem = { id: "pkg1", code: "SVC-UMRAH-AIR", category: "UMRAH_PACKAGE", pricingMode: "FIXED", basePrice: "796", currency: "SAR", priceUnit: "PER_TRAVELER", isVisaType: false };
const visaItem = { id: "visa1", code: "VISA-EGYPT-CLEARANCE-AIR", isVisaType: true, pricingMode: "FIXED", basePrice: "120", currency: "USD", priceUnit: "PER_TRAVELER" };

test("match exact published package, never another service or a missing item", () => {
  assert.equal(findFreshPricedItem(packageItem, { packages: [{ ...packageItem, id: "other" }, packageItem] }).id, "pkg1");
  assert.equal(findFreshPricedItem(packageItem, { packages: [] }), null);
  assert.equal(findFreshPricedItem(visaItem, { catalog: { services: [{ ...visaItem, isVisaType: false }], visaTypes: [visaItem] } }).id, "visa1");
});
test("fixed amount, currency, unit and payment timing require re-confirmation", () => {
  assert.equal(assessLiveFixedPrice(packageItem, { ...packageItem }).status, "CURRENT");
  for (const change of [{ basePrice: "850" }, { currency: "USD" }, { priceUnit: "PER_REQUEST" }, { paymentAfterDocumentReview: true }]) {
    assert.equal(assessLiveFixedPrice(packageItem, { ...packageItem, ...change }).status, "CHANGED");
  }
});
test("missing, inactive or non-fixed item never grants booking confirmation", () => {
  for (const changed of [null, { ...packageItem, active: false }, { ...packageItem, pricingMode: "QUOTE" }, { ...packageItem, basePrice: "0" }]) {
    assert.equal(assessLiveFixedPrice(packageItem, changed).status, "UNAVAILABLE");
  }
});
