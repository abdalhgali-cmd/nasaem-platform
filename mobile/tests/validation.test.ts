import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isIsoDate, validateFlightSearch } from "../src/utils/validation";

const NOW = new Date("2026-10-05T10:00:00Z");
const valid = { from: "PZU", to: "JED", date: "2026-12-31", roundTrip: false, travelers: "1" };

describe("isIsoDate", () => {
  test("REGRESSION: accepts a real date (the old /^\\\\d{4}-.../ literal rejected every date)", () => {
    // The shipped flight screen used /^\\d{4}-\\d{2}-\\d{2}$/ (escaped twice), which
    // matches the text "\dddd-\dd-\dd" and so rejected "2026-10-05".
    const brokenLiteral = /^\\d{4}-\\d{2}-\\d{2}$/;
    assert.equal(brokenLiteral.test("2026-10-05"), false, "documents the original bug");
    assert.equal(isIsoDate("2026-10-05"), true);
  });

  test("rejects impossible calendar dates and wrong formats", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-1-5", "26-10-05", "2026/10/05", "", "abcd-ef-gh", "2026-10-05T00:00"]) {
      assert.equal(isIsoDate(bad), false, bad);
    }
    assert.equal(isIsoDate("2028-02-29"), true, "leap day");
    assert.equal(isIsoDate("2027-02-29"), false, "not a leap year");
  });
});

describe("validateFlightSearch", () => {
  test("accepts a valid one-way search", () => {
    assert.equal(validateFlightSearch(valid, NOW), null);
  });

  test("requires both cities", () => {
    assert.match(validateFlightSearch({ ...valid, from: " " }, NOW) ?? "", /مدينة/);
    assert.match(validateFlightSearch({ ...valid, to: "" }, NOW) ?? "", /مدينة/);
  });

  test("rejects a malformed or past travel date", () => {
    assert.match(validateFlightSearch({ ...valid, date: "31-12-2026" }, NOW) ?? "", /YYYY-MM-DD/);
    assert.match(validateFlightSearch({ ...valid, date: "2026-10-04" }, NOW) ?? "", /الماضي/);
    assert.equal(validateFlightSearch({ ...valid, date: "2026-10-05" }, NOW), null, "today is allowed");
  });

  test("round trip needs a valid return date on or after departure", () => {
    const trip = { ...valid, roundTrip: true };
    assert.match(validateFlightSearch(trip, NOW) ?? "", /العودة/);
    assert.match(validateFlightSearch({ ...trip, returnDate: "2026-12-30" }, NOW) ?? "", /بعد/);
    assert.equal(validateFlightSearch({ ...trip, returnDate: "2027-01-10" }, NOW), null);
  });

  test("traveler count must be a whole number from 1 to 20", () => {
    for (const bad of ["0", "-1", "1.5", "abc", "21", ""]) {
      assert.match(validateFlightSearch({ ...valid, travelers: bad }, NOW) ?? "", /المسافرين/, bad);
    }
    assert.equal(validateFlightSearch({ ...valid, travelers: "20" }, NOW), null);
  });
});
