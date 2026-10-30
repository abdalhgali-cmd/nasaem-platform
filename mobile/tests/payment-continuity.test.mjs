import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paymentJourneyHtml } from "../www/js/payment-journey.js";

test("payment stays one continuous journey from receipt review to execution wait", () => {
  const review = paymentJourneyHtml({ paymentStatus: "UNDER_REVIEW" });
  assert.match(review, /إشعار التحويل/);
  assert.match(review, /تأكيد الدفع/);
  assert.match(review, /is-current[^>]*aria-current="step"[\s\S]*تأكيد الدفع/);

  const confirmed = paymentJourneyHtml({ paymentStatus: "CONFIRMED" });
  assert.match(confirmed, /is-current[^>]*aria-current="step"[\s\S]*بدء التنفيذ/);
});

test("receipt upload refreshes the same payment screen instead of finishing outside it", async () => {
  const source = await readFile(new URL("../www/js/screens/request-payment.js", import.meta.url), "utf8");
  assert.match(source, /تم تأكيد الدفع/);
  assert.match(source, /طلبك في انتظار بدء التنفيذ/);
  assert.match(source, /renderRequestPaymentScreen\(\{ bodyEl, params: paymentParams \}\)/);
  assert.doesNotMatch(source, /finish\(paymentParams, request \|\| summary\)/);
});
