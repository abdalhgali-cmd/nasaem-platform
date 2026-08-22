import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("flight booking workflow contract", () => {
  it("uses the intended status sequence", () => {
    assert.deepEqual(
      ["REQUESTED", "PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED", "FINAL_TICKET_ISSUED"],
      ["REQUESTED", "PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED", "FINAL_TICKET_ISSUED"],
    );
  });
});
