import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { errorState } from "../www/js/ui.js";
import { receiptPickerHtml } from "../www/js/payment-receipt.js";

const esc = (value) => String(value);
const icon = () => "";

test("contextual errors say what stayed safe and escape supplied text", () => {
  const html = errorState("تعذر الاتصال", { title: "تعذر تحديث طلباتك", hint: "طلباتك المحفوظة لم تتغير <بعد>." });
  assert.match(html, /تعذر تحديث طلباتك/);
  assert.match(html, /طلباتك المحفوظة لم تتغير/);
  assert.doesNotMatch(html, /<بعد>/);
});

test("file upload progress is announced to assistive technology", () => {
  const html = receiptPickerHtml(esc, icon);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /aria-label="رفع إشعار التحويل"/);
});

test("toast and copy actions expose success without relying on color", async () => {
  const [shell, payment] = await Promise.all([
    readFile(new URL("../www/index.html", import.meta.url), "utf8"),
    readFile(new URL("../www/js/payment-receipt.js", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /aria-live="polite"/);
  assert.match(payment, /تم النسخ ✓/);
  assert.match(payment, /copy-success/);
});
