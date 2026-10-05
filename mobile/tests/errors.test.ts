import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, NetworkError, friendlyError, serverMessage, statusMessage } from "../src/utils/errors";

describe("friendlyError", () => {
  test("network failures keep their own clear message", () => {
    const error = new NetworkError("تعذر الاتصال بالخادم.", "offline");
    assert.equal(friendlyError(error), "تعذر الاتصال بالخادم.");
  });

  test("prefers the server's message for validation-style failures", () => {
    assert.equal(statusMessage(400, { message: "رقم الهاتف غير صحيح" }), "رقم الهاتف غير صحيح");
    assert.equal(friendlyError(new ApiError(statusMessage(400, { message: "رقم الهاتف غير صحيح" }), 400)), "رقم الهاتف غير صحيح");
  });

  test("maps well-known statuses", () => {
    assert.match(statusMessage(401, null), /انتهت جلسة/);
    assert.match(statusMessage(403, null), /صلاحية/);
    assert.match(statusMessage(413, null), /10/);
    assert.match(statusMessage(429, null), /محاولات كثيرة/);
    assert.match(statusMessage(500, { message: "internal detail that must not be shown" }), /غير متاحة/);
    assert.doesNotMatch(statusMessage(502, { message: "stack trace" }), /stack trace/);
  });

  test("ignores a missing/odd payload and falls back", () => {
    assert.equal(serverMessage(null), null);
    assert.equal(serverMessage({ message: 42 }), null);
    assert.equal(serverMessage({ message: "  " }), null);
    assert.equal(friendlyError(undefined, "fallback"), "fallback");
  });
});
