import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/utils/phone.js";

describe("normalizePhone", () => {
  test("accepts the international format with a leading +", () => {
    assert.equal(normalizePhone("+249911234567"), "249911234567");
  });

  test("accepts the 00 international dialing prefix", () => {
    assert.equal(normalizePhone("00249911234567"), "249911234567");
  });

  test("accepts the local format with a leading 0", () => {
    assert.equal(normalizePhone("0911234567"), "249911234567");
  });

  test("accepts a bare 9-digit subscriber number", () => {
    assert.equal(normalizePhone("911234567"), "249911234567");
  });

  test("ignores spaces and dashes", () => {
    assert.equal(normalizePhone("+249 91-123 4567"), "249911234567");
  });

  test("all equivalent formats converge to the same key", () => {
    const forms = ["+249911234567", "00249911234567", "0911234567", "911234567", "+249 911 234 567"];
    const normalized = new Set(forms.map(normalizePhone));
    assert.equal(normalized.size, 1);
  });

  test("rejects a subscriber number not starting with 9", () => {
    assert.equal(normalizePhone("0811234567"), null);
  });

  test("rejects unrecognized input", () => {
    assert.equal(normalizePhone("not a phone number"), null);
    assert.equal(normalizePhone(""), null);
    assert.equal(normalizePhone(undefined), null);
  });
});
