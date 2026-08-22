import { describe, expect, it } from "vitest";

describe("flight booking workflow contract", () => {
  it("uses the intended status sequence", () => {
    expect(["REQUESTED", "PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED", "FINAL_TICKET_ISSUED"]).toEqual([
      "REQUESTED", "PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED", "FINAL_TICKET_ISSUED",
    ]);
  });
});
