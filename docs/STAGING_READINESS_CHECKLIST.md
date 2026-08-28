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
| Register | حساب staging تجريبي ورسائل validation | يمكن إنشاء عملاء صناعيين في CI؛ live staging غير متاح | STAGING ACCESS REQUIRED | `registerCustomer()` test helper | QA |
| Login/Logout | session boundary وlogout وexpired session | كود auth واختبارات موجودة؛ live staging غير منفذ | STAGING ACCESS REQUIRED | Auth tests + CI | QA + Security |
| Account | requests/orders/offers/invoices/payments/documents/deliverables/notifications | Customer Account موجود؛ بيانات staging غير متاحة | STAGING ACCESS REQUIRED | Customer portal code + CI | Customer Ops |
| Tracking | reference/status/timeline/next action/retry/error | timeout/error/retry موجودة؛ live reference غير متوفر | STAGING ACCESS REQUIRED | Tracking component + E2E | QA |
| Documents | MIME/size/extension/ownership/upload/re-upload | server-side validation واختبارات ownership موجودة؛ لم تُرفع ملفات staging | STAGING ACCESS REQUIRED | Document security tests | Security + Ops |
| Offers | view وapprove/reject وownership وaudit | workflow موجود؛ لا يوجد offer staging للاختبار | STAGING ACCESS REQUIRED | Offer/customer tests | Sales Ops |
| Invoice | historical snapshot وpayment instructions | workflow موجود؛ لا توجد invoice staging | STAGING ACCESS REQUIRED | Order/payment code | Finance |
| Payment Proof | upload وpending review وcustomer isolation | manual proof flow موجود؛ لم يُرفع proof تجريبي على staging | STAGING ACCESS REQUIRED | Payment tests | Finance + QA |
| Payment Review | authorization وapprove/reject وaudit وnotification | صلاحيات ومسار المراجعة موجودان؛ live test غير منفذ | STAGING ACCESS REQUIRED | RBAC/payment tests | Finance |
| Notifications | lifecycle events وrecipient ownership وno sensitive payloads | اختبار A/B آلي يثبت منع cross-customer mutation في CI | PASS IN CI / STAGING RECHECK REQUIRED | `customerIsolation.test.js` | Ops + Security |
| Deliverables | ownership وdownload وstatus وnotification | ownership flow موجود؛ لا يوجد deliverable staging | STAGING ACCESS REQUIRED | Customer portal code | Delivery Ops |
| Admin | loading/empty/error/retry، search/filter، confirmations | Admin modules موجودة؛ live role matrix غير منفذ | STAGING ACCESS REQUIRED | Admin code + CI | Admin Lead |
| RBAC | lower roles لا تصعّد ولا تنفذ mutations محظورة | guards واختبارات موجودة؛ API matrix staging غير منفذ | STAGING ACCESS REQUIRED | RBAC tests | Security |
| Mobile | no overflow وforms/dialogs/buttons وRTL | Playwright mobile coverage موجود؛ visual staging غير منفذ | STAGING ACCESS REQUIRED | CI Playwright | QA |
| Accessibility | keyboard/focus/labels/aria/contrast/reduced motion | typecheck/build ناجحان؛ audit شامل غير منفذ | STAGING ACCESS REQUIRED | Typecheck/build | QA |
| SEO | title/description/OG/canonical/robots/sitemap/private noindex | implementation موجود؛ staging headers غير مقاسة | STAGING ACCESS REQUIRED | SEO code review | Marketing + QA |
| Error handling | sanitized 5xx بلا stack/Prisma/path/token leakage | regression test موجود؛ staging fault test غير منفذ | STAGING ACCESS REQUIRED | `errorMiddleware.test.js` + CI | Security |

## Customer isolation model

NASAEM في نطاق الإطلاق الحالي هو تطبيق لوكالة واحدة يخدم عملاء متعددين، وليس SaaS متعدد الوكالات. لذلك حد العزل الأمني المطلوب هو **Customer A مقابل Customer B** عبر هوية العميل المصادق عليها و`customerId` على الموارد المملوكة للعميل.

لا يُطلب إنشاء `Tenant` أو `Organization` في Prisma لإثبات هذا العزل. يصبح ذلك متطلبًا منفصلًا فقط إذا تغير نطاق المنتج مستقبلًا ليستضيف شركات/وكالات مستقلة متعددة داخل نفس النشر وقاعدة البيانات.

## Automated A/B evidence

تمت إضافة `backend/tests/customerIsolation.test.js` لاختبار عميلين مستقلين فعليًا في قاعدة PostgreSQL الخاصة بالـCI. يغطي الاختبار:

- Customer A يرى طلبه ولا يرى طلب Customer B في القائمة.
- Customer B يرى طلبه ولا يرى طلب Customer A.
- direct ID access لطلب العميل الآخر يُرجع 404 في الاتجاهين.
- كل عميل يستطيع تعديل إشعاره الخاص فقط.
- محاولة تعديل إشعار العميل الآخر تُرجع 404.

النتيجة المطلوبة على المسارات المغطاة:

> **CROSS-CUSTOMER ACCESS = 0**

هذا دليل آلي على مستوى repository/CI، لكنه لا يلغي اختبار staging الحي للمسارات الأخرى.

## Mandatory live isolation tests

بعد توفير staging access، أنشئ Customer A وCustomer B ببيانات صناعية فقط. اختبر requests وorders وoffers وinvoices وpayments وdocuments وnotifications وdeliverables عبر UI وdirect routes وAPI وmodified IDs وbody/query parameters. سجّل HTTP status وPASS/FAIL فقط، وتوقع `401/403/404/null` حسب عقد endpoint. لا تحفظ بيانات شخصية غير لازمة ولا تستخدم Production.

## Exit criteria

لا تنتقل إلى Production قبل إغلاق بنود Staging المطلوبة بدليل فعلي ومالك واضح، ونجاح customer isolation وdocument/payment/RBAC tests، واعتماد legal وcommercial inputs، وإثبات backup/restore وmonitoring وrollback وRPO/RTO في بيئة معزولة أو staging معتمدة.

**Current gate: STAGING ACCESS REQUIRED for live verification.**

## Launch-readiness audit update — 2026-08-28

| Gate | Current evidence-based status | Required next evidence |
|---|---|---|
| Staging deployment and environment | BLOCKED — no authorized Staging URL, secrets, database, or external-service credentials were supplied | Owner/Infrastructure must provide a disposable Staging environment and non-Production credentials |
| Customer A/B isolation | PASS IN BACKEND CI FOR COVERED ORDER/NOTIFICATION PATHS; LIVE STAGING VERIFICATION REQUIRED | Repeat direct-object and ownership matrix across all customer-owned resources in Staging |
| RBAC and server authorization | REPOSITORY TESTS PRESENT; LIVE STAGING VERIFICATION REQUIRED | Execute the role matrix against direct API calls and UI routes in Staging |
| Files and documents | REPOSITORY TESTS PRESENT for authenticated upload/ownership behavior; LIVE PRIVATE-DOWNLOAD TEST REQUIRED | Verify each synthetic customer cannot access another customer’s document or download URL |
| Payments and suppliers | EXTERNAL VERIFICATION REQUIRED | Use provider/supplier sandbox credentials where integrations exist and execute failure/retry/duplicate/timeout/idempotency matrix |
| Backup, restore, monitoring, and rollback | INFRASTRUCTURE INPUT REQUIRED | Supply configuration evidence and execute isolated non-Production drills |

### Controlled two-customer procedure once Staging exists

Create synthetic Customer A and Customer B with separate accounts and non-real documents. Record all generated IDs. Authenticate as A and attempt direct access, list, search, filter, export, upload, and download operations using B’s identifiers; repeat the inverse as B. Repeat with altered path parameters, query parameters, request bodies, and pagination/export inputs. Run the relevant staff-role matrix separately and record response codes and audit events. Any successful unauthorized cross-customer read, mutation, or file access blocks release.
