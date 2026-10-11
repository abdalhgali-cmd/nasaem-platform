import { test } from "node:test";
import assert from "node:assert/strict";
import { arabicErrorMessage } from "../www/js/errors-ar.js";

test("Arabic server messages pass through; English or technical ones become Arabic by status", () => {
  assert.equal(arabicErrorMessage(409, "الطلب مغلق"), "الطلب مغلق");
  assert.match(arabicErrorMessage(429, "Too many requests. Please try again later."), /محاولات كثيرة/);
  assert.match(arabicErrorMessage(400, "Validation failed"), /غير صحيحة/);
  assert.match(arabicErrorMessage(503, ""), /غير متاحة/);
  assert.match(arabicErrorMessage(418, "I'm a teapot"), /تعذر إكمال/);
  assert.match(arabicErrorMessage(520, "Bad gateway"), /خطأ في الخادم/);
});
