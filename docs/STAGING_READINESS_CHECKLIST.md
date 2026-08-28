# NASAEM — Staging Readiness Checklist

> هذه القائمة مخصصة لبيئة **controlled staging** فقط. لم تتوفر في هذه المهمة صلاحية أو URL لبيئة staging؛ لذلك لا تُحوّل `UNKNOWN` إلى `PASS` ولا تُستخدم Production بدلًا منها.

| Area | Expected | Actual | Status | Evidence | Owner |
|---|---|---|---|---|---|
| Homepage | RTL، hero، dynamic services، CTA، FAQ/Highlights | التنفيذ موجود؛ فحص staging المرئي غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | PR #42، CI Playwright | Product + QA |
| Services | الخدمات النشطة فقط، السعر الآمن، الصورة، الرابط | API-backed implementation موجود؛ بيانات staging غير مثبتة | UNKNOWN — STAGING ACCESS REQUIRED | Service catalog code + CI | Product |
| International Visa | التصنيف والفلترة والrequirements والأسعار المعتمدة | server-side catalog/filtering موجود؛ staging data غير متاحة | UNKNOWN — STAGING ACCESS REQUIRED | Visa tests + Playwright | Visa Ops |
| Family Visit | مسار منفصل عن International وUmrah | الفصل موجود في الكتالوج؛ staging UI غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | Visa categorization tests | Visa Ops |
| Umrah | dynamic catalog وطلب عرض دون حجز فوري | التنفيذ موجود؛ لا توجد باقة staging معتمدة متاحة للاختبار | UNKNOWN — OWNER/STAGING INPUT REQUIRED | Package Builder code | Umrah Ops |
| Packages | الباقات المنشورة فقط وloading/error/empty | states موجودة؛ staging visibility غير مثبتة | UNKNOWN — STAGING ACCESS REQUIRED | Packages page + E2E | Product |
| Request Wizard | validation، reference، confirmation، next step | المسار موجود؛ إنشاء طلب staging لم يُنفذ | UNKNOWN — STAGING ACCESS REQUIRED | Playwright coverage | QA |
| Register | حساب staging تجريبي ورسائل validation | لم تُنشأ حسابات اختبار | UNKNOWN — STAGING ACCESS REQUIRED | لا يوجد staging credential | QA |
| Login/Logout | session boundary وlogout وexpired session | كود auth واختبارات موجودة؛ live staging غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | Auth tests + CI | QA + Security |
| Account | requests/orders/offers/invoices/payments/documents/deliverables/notifications | Customer Account موجود؛ بيانات staging غير متاحة | UNKNOWN — STAGING ACCESS REQUIRED | Customer portal code + CI | Customer Ops |
| Tracking | reference/status/timeline/next action/retry/error | timeout/error/retry موجودة؛ live reference غير متوفر | UNKNOWN — STAGING ACCESS REQUIRED | Tracking component + E2E | QA |
| Documents | MIME/size/extension/ownership/upload/re-upload | server-side validation موجودة؛ لم تُرفع ملفات staging | UNKNOWN — STAGING ACCESS REQUIRED | Document security code | Security + Ops |
| Offers | view وapprove/reject وownership وaudit | workflow موجود؛ لا يوجد offer staging للاختبار | UNKNOWN — STAGING ACCESS REQUIRED | Offer/customer tests | Sales Ops |
| Invoice | historical snapshot وpayment instructions | workflow موجود؛ لا توجد invoice staging | UNKNOWN — STAGING ACCESS REQUIRED | Order/payment code | Finance |
| Payment Proof | upload وpending review وcustomer isolation | manual proof flow موجود؛ لم يُرفع proof تجريبي | UNKNOWN — STAGING ACCESS REQUIRED | Payment tests | Finance + QA |
| Payment Review | authorization وapprove/reject وaudit وnotification | صلاحيات ومسار المراجعة موجودان؛ live test غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | RBAC/payment tests | Finance |
| Notifications | lifecycle events وrecipient ownership وno sensitive payloads | نماذج ومسارات موجودة؛ recipient test staging غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | Notification/customer isolation tests | Ops |
| Deliverables | ownership وdownload وstatus وnotification | المسار موجود؛ لا يوجد deliverable staging | UNKNOWN — STAGING ACCESS REQUIRED | Customer portal code | Delivery Ops |
| Admin | loading/empty/error/retry، search/filter، confirmations | Admin modules موجودة؛ live role matrix غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | Admin code + CI | Admin Lead |
| RBAC | lower roles لا تصعّد ولا تنفذ mutations محظورة | guards واختبارات موجودة؛ API matrix staging غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | RBAC tests | Security |
| Mobile | no overflow وforms/dialogs/buttons وRTL | Playwright mobile coverage ناجح؛ visual staging غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | CI Playwright | QA |
| Accessibility | keyboard/focus/labels/aria/contrast/reduced motion | تغييرات الملفات اجتازت lint/TypeScript؛ audit شامل غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | Lint/typecheck | QA |
| SEO | title/description/OG/canonical/robots/sitemap/private noindex | implementation موجود؛ staging headers غير مقاسة | UNKNOWN — STAGING ACCESS REQUIRED | SEO code review | Marketing + QA |
| Error handling | sanitized 5xx بلا stack/Prisma/path/token leakage | regression test ناجح على مستوى repository؛ staging fault test غير منفذ | UNKNOWN — STAGING ACCESS REQUIRED | `errorMiddleware.test.js` + CI | Security |

## Mandatory isolation tests

يجب، بعد توفير staging access، إنشاء Customer A وCustomer B ببيانات غير حقيقية فقط. اختبر requests وorders وoffers وinvoices وpayments وdocuments وnotifications وdeliverables عبر UI وdirect routes وAPI وmodified IDs وbody/query parameters. سجّل HTTP status وPASS/FAIL فقط، وتوقع `401/403/404/null` حسب عقد endpoint. لا تحفظ بيانات شخصية غير لازمة ولا تستخدم Production.

## Exit criteria

لا تنتقل إلى Production قبل إغلاق كل `UNKNOWN` بدليل فعلي ومالك واضح، ونجاح customer isolation وdocument/payment/RBAC tests، واعتماد legal وcommercial inputs، وإثبات backup/restore وmonitoring وrollback وRPO/RTO في بيئة معزولة أو staging معتمدة.

**Current gate: STAGING ACCESS REQUIRED.**

## Launch-readiness audit update — 2026-08-28

The repository and PR #42 were rechecked on branch `feature/launch-readiness-remediation` at HEAD `d14f847aec1aab73c28b3fb1d20e3e679bb21cda`. The working tree was clean before this update, and no Production deployment, migration, credential, or real payment data was used.

| Gate | Current evidence-based status | Required next evidence |
|---|---|---|
| Staging deployment and environment | BLOCKED — no authorized Staging URL, secrets, database, or external-service credentials were supplied | Owner/Infrastructure must provide a disposable Staging environment and non-Production credentials |
| Customer A/B isolation | BLOCKED — the Prisma schema has no tenant/organization boundary; the application is currently single-tenant | Product/Architecture must define a tenant model and ownership policy before a two-customer isolation PASS is possible |
| RBAC and server authorization | REPOSITORY REVIEW PASS; LIVE STAGING VERIFICATION REQUIRED | Execute the role matrix against direct API calls and UI routes in Staging |
| Files and documents | REPOSITORY REVIEW PASS for authenticated upload middleware and server-derived file metadata; LIVE OWNERSHIP/PRIVATE-DOWNLOAD TEST REQUIRED | Verify each synthetic customer cannot access another customer’s document or download URL |
| Payments and suppliers | EXTERNAL VERIFICATION REQUIRED | Use provider/supplier sandbox credentials and execute the failure, retry, duplicate, timeout, and idempotency matrix |
| Backup, restore, monitoring, and rollback | INFRASTRUCTURE INPUT REQUIRED | Supply configuration evidence and execute isolated non-Production drills |

The required tenant result remains **CROSS-TENANT ACCESS = 0**. It must not be marked PASS for this single-tenant schema until tenant boundaries exist and are tested at the API, database, file, search, and export layers.

### Controlled two-customer procedure once Staging exists

Create synthetic Customer A and Customer B with separate accounts and non-real documents. Record all generated IDs. Authenticate as A and attempt direct access, list, search, filter, export, upload, and download operations using B’s identifiers; repeat the inverse as B. Repeat with altered path parameters, query parameters, request bodies, and pagination/export inputs. Run the same matrix through each staff role and record response codes, response bodies, database ownership predicates, and audit events. Any successful cross-boundary read, mutation, or file access is a failure and blocks release.
