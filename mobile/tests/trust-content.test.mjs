import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { paymentSafetyHtml } from "../www/js/payment-receipt.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("payment safety names the trusted source and never calls a receipt confirmed payment", () => {
  const html = paymentSafetyHtml();
  assert.match(html, /فقط إلى حساب يظهر داخل هذه الصفحة/);
  assert.match(html, /لا يعني تأكيد الدفع/);
  assert.match(html, /مطابقته مع البنك/);
});

test("service, documents and tracking put trust guidance beside the customer's decision", async () => {
  const [service, intake, requests, about, umrah, egypt] = await Promise.all([
    read("../www/js/screens/service-info.js"),
    read("../www/js/screens/intake.js"),
    read("../www/js/screens/requests.js"),
    read("../www/js/screens/about.js"),
    read("../www/js/screens/umrah.js"),
    read("../www/js/screens/egypt-clearance.js"),
  ]);
  assert.match(service, /لا دفع قبل ظهور المبلغ والحساب المعتمد/);
  assert.match(service, /لا نعلن اكتمال الخدمة قبل تأكيد الجهة المنفذة/);
  assert.match(intake, /يقتصر الوصول عليها على الموظفين المخولين/);
  assert.match(requests, /المطلوب منك الآن/);
  assert.match(requests, /لا يلزمك إجراء الآن/);
  assert.match(about, /بيانات التواصل الرسمية/);
  assert.match(umrah, /لا نعلن اكتمال الخدمة قبل تسليم النتيجة المؤكدة/);
  assert.match(egypt, /لا نعلن صدور الموافقة قبل رفعها من فريق الوكالة/);
});
