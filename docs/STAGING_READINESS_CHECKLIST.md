# NASAEM — Staging Readiness Checklist

> هذه القائمة مخصصة لبيئة **controlled staging** فقط. لا تستخدم بيانات Production أو credentials إنتاجية. يجب تسجيل الدليل الفعلي لكل اختبار قبل تحويل الحالة إلى `PASS`.

| Area | Expected | Actual | Status | Owner |
|---|---|---|---|---|
| Homepage | تحميل RTL، hero، الخدمات الديناميكية، CTA، FAQ/Highlights | يُسجل بعد staging deploy | UNKNOWN | Product + QA |
| Services | ظهور الخدمات النشطة فقط، السعر الآمن، الصورة، الرابط | يُسجل بعد staging deploy | UNKNOWN | Product |
| International Visa | التصنيف والفلترة والـrequirements والأسعار المعتمدة | يُسجل بعد staging deploy | UNKNOWN | Visa Ops |
| Family Visit | مسار منفصل عن International وUmrah | يُسجل بعد staging deploy | UNKNOWN | Visa Ops |
| Umrah | الكتالوج الديناميكي وطلب العرض دون حجز فوري | يُسجل بعد staging deploy | UNKNOWN | Umrah Ops |
| Packages | الباقات المنشورة فقط، empty/loading/error states | يُسجل بعد staging deploy | UNKNOWN | Product |
| Request Wizard | validation، reference، confirmation، next step | يُسجل بعد staging deploy | UNKNOWN | QA |
| Register | إنشاء حساب تجريبي staging فقط ورسائل validation | يُسجل بعد staging deploy | UNKNOWN | QA |
| Login/Logout | session boundary، logout، expired session | يُسجل بعد staging deploy | UNKNOWN | QA + Security |
| Account | requests/orders/offers/invoices/payments/documents/deliverables/notifications | يُسجل بعد staging deploy | UNKNOWN | Customer Ops |
| Tracking | reference، status، timeline، next action، retry/error | يُسجل بعد staging deploy | UNKNOWN | QA |
| Documents | MIME/size/extension/ownership، upload وre-upload | يُسجل بعد staging deploy | UNKNOWN | Security + Ops |
| Offers | view، approve/reject، ownership، audit event | يُسجل بعد staging deploy | UNKNOWN | Sales Ops |
| Invoice | historical amount/currency snapshot وعرض instructions | يُسجل بعد staging deploy | UNKNOWN | Finance |
| Payment Proof | upload، pending review، customer isolation | يُسجل بعد staging deploy | UNKNOWN | Finance + QA |
| Payment Review | staff authorization، approve/reject، audit، notification | يُسجل بعد staging deploy | UNKNOWN | Finance |
| Notifications | recipient ownership، lifecycle events، no sensitive payloads | يُسجل بعد staging deploy | UNKNOWN | Ops |
| Deliverables | ownership، download، status، notification | يُسجل بعد staging deploy | UNKNOWN | Delivery Ops |
| Admin | loading/empty/error/retry، search/filter، safe confirmations | يُسجل بعد staging deploy | UNKNOWN | Admin Lead |
| RBAC | lower roles cannot escalate or perform restricted mutations | يُسجل بعد staging deploy | UNKNOWN | Security |
| Mobile | no horizontal overflow، usable forms/dialogs/buttons، Arabic RTL | يُسجل بعد staging deploy | UNKNOWN | QA |
| Accessibility | keyboard، focus، labels، aria، contrast، reduced motion | يُسجل بعد staging audit | UNKNOWN | QA |
| SEO | title/description/OG/canonical/robots/sitemap/private noindex | يُسجل بعد staging deploy | UNKNOWN | Marketing + QA |
| Error handling | sanitized 5xx، no stack/Prisma/path/token leakage | يُسجل بعد staging deploy | UNKNOWN | Security |

## Mandatory isolation tests

أنشئ حسابي staging منفصلين (Customer A وCustomer B) ببيانات اختبار غير حقيقية. تحقق من أن A لا يستطيع قراءة أو تعديل requests أو orders أو offers أو invoices أو payments أو documents أو notifications أو deliverables الخاصة بـB عبر الواجهة أو تغيير IDs في الطلبات. سجّل response status والنتيجة دون حفظ بيانات شخصية غير لازمة.

## Exit criteria

لا تنتقل إلى Production قبل أن تكون كل الاختبارات الحرجة `PASS`، وأن تُغلق نتائج الـ`UNKNOWN` بمالك ودليل، وأن تتم مراجعة legal وbackup/restore وmonitoring وpayment/supplier decisions بشكل مستقل.
