import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateCustomerPrice } from "../src/utils/pricing.js";

describe("customer pricing calculator", () => {
  test("converts source currency and applies markup", () => {
    const result = calculateCustomerPrice({
      sourceAmount: 100,
      exchangeRate: 600,
      marginPercent: 5,
    });

    assert.deepEqual(result, {
      sourceAmount: 100,
      exchangeRate: 600,
      marginPercent: 5,
      convertedCost: 60000,
      marginAmount: 3000,
      customerPrice: 63000,
    });
  });

  test("supports zero margin", () => {
    const result = calculateCustomerPrice({ sourceAmount: 25, exchangeRate: 250 });
    assert.equal(result.customerPrice, 6250);
  });

  test("rejects invalid negative values", () => {
    assert.throws(
      () => calculateCustomerPrice({ sourceAmount: -1, exchangeRate: 1, marginPercent: 0 }),
      /sourceAmount/,
    );
    assert.throws(
      () => calculateCustomerPrice({ sourceAmount: 1, exchangeRate: -1, marginPercent: 0 }),
      /exchangeRate/,
    );
    assert.throws(
      () => calculateCustomerPrice({ sourceAmount: 1, exchangeRate: 1, marginPercent: -1 }),
      /marginPercent/,
    );
  });
});
