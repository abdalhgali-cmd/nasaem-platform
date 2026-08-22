import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPricingDescription,
  pricingOfferSchema,
  pricingQuoteSchema,
  previewContactRequestPrice,
} from "../src/modules/contact-requests/contact-requests.pricing.js";

describe("contact request pricing quotes", () => {
  test("calculates the customer price and builds an audit-friendly description", () => {
    const input = {
      sourceAmount: 100,
      exchangeRate: 600,
      marginPercent: 5,
      currency: "SDG",
      description: "تذكرة طيران",
    };

    const parsed = pricingQuoteSchema.parse(input);
    const pricing = previewContactRequestPrice(parsed);

    assert.equal(pricing.convertedCost, 60000);
    assert.equal(pricing.marginAmount, 3000);
    assert.equal(pricing.customerPrice, 63000);
    assert.match(buildPricingDescription(parsed), /100/);
    assert.match(buildPricingDescription(parsed), /600/);
    assert.match(buildPricingDescription(parsed), /5%/);
    assert.match(buildPricingDescription(parsed), /تذكرة طيران/);
  });

  test("requires a carrier for calculated multi-option offers", () => {
    const result = pricingOfferSchema.safeParse({
      sourceAmount: 100,
      exchangeRate: 600,
      marginPercent: 5,
      currency: "SDG",
    });

    assert.equal(result.success, false);
  });
});
