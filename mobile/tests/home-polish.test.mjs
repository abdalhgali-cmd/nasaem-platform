import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const homeSource = await readFile(new URL("../www/js/screens/home.js", import.meta.url), "utf8");
const shellSource = await readFile(new URL("../www/index.html", import.meta.url), "utf8");
const accountSource = await readFile(new URL("../www/js/screens/account.js", import.meta.url), "utf8");

test("home presents the two release journeys directly without a fake search or generic promotion carousel", () => {
  assert.match(homeSource, /اختر خدمتك/);
  assert.match(homeSource, /دون إنشاء حساب/);
  assert.doesNotMatch(homeSource, /ابحث عن خدمة أو ابدأ طلبك/);
  assert.doesNotMatch(homeSource, /home-banner/);
  assert.doesNotMatch(homeSource, /خدمات مختارة/);
});

test("guest-first navigation describes actions instead of implying registration", () => {
  assert.match(shellSource, />ابدأ طلب</);
  assert.match(shellSource, />متابعة</);
  assert.match(shellSource, />المزيد</);
  assert.doesNotMatch(shellSource, />حسابي</);
  assert.match(accountSource, /<h2>الحساب اختياري<\/h2>/);
  assert.match(accountSource, /دون تسجيل/);
});

test("home explains the honest request flow and keeps tracking prominent", () => {
  assert.match(homeSource, /ادفع للحساب المعتمد/);
  assert.match(homeSource, /تابع حتى التسليم/);
  assert.match(homeSource, /id="homeTrackBtn"/);
});
