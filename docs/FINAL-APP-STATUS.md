# حالة النسخة النهائية — نسائم الحرمين (فرع `claude/busy-hamilton-1ccxm1`)

لا نشر للإنتاج، لا دمج في `main`، لا لمس لقاعدة الإنتاج. هذا الفرع مبني فوق سلسلة الـPRs المفتوحة #77–#86 (انظر تقرير المرحلة 0).

## ما تحقق منه فعليًا (من حالة نظيفة: قواعد بيانات جديدة، `npm ci` لكل مشروع)

| الفحص | الأمر | النتيجة |
|---|---|---|
| Backend (Postgres 16) | `npx prisma migrate deploy && npm run prisma:seed && npm test` | **769 ناجح / 0 فاشل** |
| التطبيق | `npm run check && node --test tests/*.test.mjs` | **57 ناجح** |
| الموقع | `npm run typecheck`، `npm run lint` | نظيفان |
| Playwright الكامل | `npx playwright test` (خوادم يشغلها Playwright نفسه) | **73 ناجح / 0 فاشل** (64 قائمة + 9 للتطبيق واللوحة) |

لم يُنفَّذ ولا يُدّعى: بناء APK/AAB، هاتف أندرويد، واتساب Meta، مزوّد الطيران، CI على GitHub لهذا الفرع.

## كل ادعاء ← دليله

| الادعاء | التنفيذ | الدليل (اختبار/أمر) |
|---|---|---|
| لا استيلاء على سجل عميل بالهاتف | `backend/src/modules/customer-auth/customer-auth.service.js` (`registerCustomer`, `findAccountByPhone`) | `backend/tests/customerAccountTakeover.test.js`, `customerSessionLifecycle.test.js` |
| كل مسار غير عام يرفض المجهول | — | `backend/tests/routeAuthorization.test.js` (قائمة بيضاء صريحة، يفحص كل المسارات) |
| صلاحيات الأدوار لكل مسار | `requireRole` يعرّض `allowedRoles` | `backend/tests/rbacMatrix.test.js` (كل دور × كل مسار)، `rbac.test.js`, `securityRoles.test.js` |
| التتبع لا يكشف شيئًا بدون رمز التحقق | `contact-request-tracking.*` | `backend/tests/trackingExposure.test.js`, `trackingOrganizationIsolation.test.js`, `otpChannelAvailability.test.js` |
| لا قراءة/إضافة على طلب هاتف آخر | — | `trackingExposure.test.js`, `contactRequestTracking.test.js` (تنزيل مستند طلب آخر) |
| مستند كل مسافر على المسافر الصحيح | `contact-request-documents.service.js` (`TRAVELER_REQUIRED`/`TRAVELER_NOT_FOUND`) | `backend/tests/travelerDocumentOwnership.test.js`, `smartCaseDocuments.test.js`, `mobile/tests/intake-core.test.mjs`, E2E «family visit» |
| OCR مقيّد (أبعاد/طابور/مهلة) | `passport-ocr.service.js` | `backend/tests/passportOcr.test.js` («resource limits») |
| لا endpoint عام لحسابات الدفع | حُذف من `flight-bookings.routes.js` | `routeAuthorization.test.js` |
| حسابات الدفع بعد الموافقة وبعملة السعر فقط | `contact-request-tracking.service.js` (`listPaymentAccountsForPhone`) | `backend/tests/paymentReviewFlow.test.js`, E2E «price → … → accepted» |
| الإيصال: مراجعة، رفض بسبب، قبول | `contact-requests.service.js` (`rejectContactRequestPayment`, `confirmContactRequestPayment`) | `paymentReviewFlow.test.js`, `rbacMatrix.test.js` (من يستطيع)، E2E نفسه |
| المقابل بالجنيه مثبّت وقت الإصدار | `finance/fx-snapshot.js` | `paymentReviewFlow.test.js` |
| الصفر ليس سعر صرف أبدًا | `flights.service.js` (`updateCurrencyRates` يرفض ≤0، الإيقاف = `null`) | `backend/tests/exchangeRates.test.js`, `mobile/tests/payment-view.test.mjs`, E2E «exchange rate» |
| إضافة/تفعيل/إيقاف/تدقيق أسعار الصرف في اللوحة | `backend/public/flight-management.html` + `assets/flight-management-page.js`, `GET /flights/admin/rates/{status,history}` | `exchangeRates.test.js`, E2E «back-office… exchange rate» |
| لا مقابل بدون سعر صرف فعّال + إشعار عربي | `mobile/www/js/payment-view.js`, `service-view.js`, `screens/service-info.js`, `requests.js` | `payment-view.test.mjs`, E2E «exchange rate» |
| التدقيق: حسابات الدفع/الإعدادات/الصرف | `payment-accounts.controller.js`, `settings.controller.js`, `flights/*.controller.js` | `backend/tests/sensitiveAudit.test.js` |
| الإشعار يفتح الطلب الصحيح | `notifyAdmins({contactRequestId})`, `notifyRequestCustomer`, `backend/public/assets/layout.js`, `mobile/www/js/screens/notifications.js` | `paymentReviewFlow.test.js` (الرابط)، E2E «staff: opening the notification…» و«customer with an account…» |
| تقرير المدفوعات حسب العملة | `finance.service.js` (`getContactRequestPaymentReport`) | `backend/tests/financeContactRequests.test.js` |
| بحث بالجواز وفلتر التاريخ | `contact-requests.service.js` | `backend/tests/contactRequestStaffSearch.test.js` |
| الـseed لا ينشئ بيانات مال تجريبية في الإنتاج | `backend/prisma/seed.js` (`IS_PRODUCTION`) | شُغّل `NODE_ENV=production npm run prisma:seed` على قاعدة فارغة: 0 حسابات دفع، 0 باقات، أسعار الصرف 0 (= غير فعّال) |
| التطبيق: الرئيسية/الخدمات/التفاصيل/النموذج/المطلوب منك | `mobile/www/js/**` | `mobile/tests/*.test.mjs` (56 اختبارًا)، `web/e2e/mobile-app.spec.ts` |
| شارة البيئة لبناء الاختبار فقط | `mobile/www/js/environment.js` | `mobile/tests/environment.test.mjs` (لا شارة عند `production`، و workflow الإصدار يفرض `production`) |
| الإصدار بمفتاح من الأسرار فقط | `.github/workflows/android-release.yml`, `mobile/android/app/build.gradle` | `mobile/tests/environment.test.mjs` (لا مفاتيح متتبَّعة ولا كلمات في الكود) — **لم يُشغَّل الـworkflow** |

## ما لم يُتحقق منه هنا (حقيقي)
بناء APK/AAB، هاتف أندرويد، واتساب Meta، مزوّد الطيران، CI على GitHub لهذا الفرع، تحديث فوق نسخة قديمة.

## قرارات حُسمت (من المالك)
- مفتاح توقيع جديد للوكالة من أسرار GitHub فقط؛ المفتاح التجريبي يُوثَّق ويُزال في PR لاحق (`docs/ANDROID-DEBUG-KEY-RISK.md`).
- staging فقط للاختبار؛ لا عنوان إنتاج ولا متغيرات إنتاج ولا نشر حتى يقدّم المالك العنوان الموثَّق.
- لا دمج لأي PR؛ تقرير الجاهزية في `docs/PR-MERGE-READINESS.md`.
- متغيرات البيئة (أسماء فقط) في `docs/ENVIRONMENT-VARIABLES.md`.

## المتبقي (لم يُنفَّذ)

- اختبار هاتف حقيقي وبناء الـAPK/AAB النهائي (يحتاج منك الخطوات 1–2 أعلاه ثم تشغيل workflow).
- ربط العميل ذي الحساب بسجل CRM قديم يحمل نفس الرقم: الآن الحساب الجديد منفصل (آمن)، والدمج عمل موظف أو بتحقق برمز.
- عمل بلا اتصال أعمق: تُحفظ الحقول المكتوبة فقط (لا الملفات)، والإرسال يتطلب اتصالًا.
- تتبع الطلب يتم برقم الهاتف + رمز واتساب (هذا هو النظام الفعلي)، وليس برقم الطلب وحده.
- ترتيب الخدمات بالسحب في لوحة الإدارة: يوجد حقل الترتيب، دون واجهة سحب.
