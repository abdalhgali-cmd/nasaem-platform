import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/utils/phone.js";

describe("normalizePhone", () => {
  test("strips spaces and dashes", () => {
    assert.equal(normalizePhone("091 103 4372"), "249911034372");
  });

  test("rewrites a leading local 0 to the 249 country code", () => {
    assert.equal(normalizePhone("0911034372"), "249911034372");
  });

  test("leaves an already-international +249 number as digits-only", () => {
    assert.equal(normalizePhone("+249 91 103 4372"), "249911034372");
  });

  test("collapses a 00-prefixed international number", () => {
    assert.equal(normalizePhone("00249911034372"), "249911034372");
  });

  test("is idempotent for an already-normalized number", () => {
    assert.equal(normalizePhone("249911034372"), "249911034372");
  });

  test("handles null/undefined/empty input without throwing", () => {
    assert.equal(normalizePhone(undefined), "");
    assert.equal(normalizePhone(null), "");
    assert.equal(normalizePhone(""), "");
  });
});
