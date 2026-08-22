import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pricingPreviewSchema, previewContactRequestPrice } from "../src/modules/contact-requests/contact-requests.pricing.js";

describe("contact request pricing preview", () => {
  test("calculates converted cost, markup and customer price", () => {
    const parsed = pricingPreviewSchema.parse({
      sourceAmount: 100,
      exchangeRate: 600,
      marginPercent: 10,
    });

    assert.deepEqual(previewContactRequestPrice(parsed), {
      sourceAmount: 100,
      exchangeRate: 600,
      marginPercent: 10,
      convertedCost: 60000,
      marginAmount: 6000,
      customerPrice: 66000,
    });
  });

  test("rejects an invalid exchange rate", () => {
    assert.throws(() => pricingPreviewSchema.parse({
      sourceAmount: 100,
      exchangeRate: 0,
      marginPercent: 10,
    }));
  });
});
