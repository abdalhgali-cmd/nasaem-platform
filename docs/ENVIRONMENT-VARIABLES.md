# متغيرات البيئة المطلوبة (أسماء فقط — لا قيم)

لا تُكتب القيم في Git ولا في الكود ولا في التقارير. تُضبط في لوحة الاستضافة (Railway/Vercel) وفي GitHub (Secrets/Variables).

## الـBackend (Railway — staging الآن)
| الاسم | مطلوب؟ | الغرض |
|---|---|---|
| `NODE_ENV` | نعم (`production` على الخوادم) | في `production` لا يُعاد رمز التحقق في الاستجابة ولا يُنشأ بيانات تجريبية |
| `DATABASE_URL` | نعم | اتصال PostgreSQL |
| `JWT_SECRET` | نعم | توقيع الجلسات |
| `JWT_EXPIRES_IN` | نعم | مدة جلسة الموظف |
| `CORS_ORIGIN` | نعم | أصول الموقع/اللوحة المسموح بها |
| `CSRF_TRUSTED_ORIGINS` | اختياري | أصول إضافية موثوقة للكتابة بالكوكيز |
| `UPLOAD_ROOT` | نعم في الإنتاج (مسار مطلق على قرص دائم) | تخزين المستندات |
| `SEED_ADMIN_PASSWORD` | عند أول seed فقط | كلمة مرور مدير النظام الأول |
| `PUBLIC_ORGANIZATION_ID` | اختياري | المؤسسة التي تملك الطلبات العامة |
| `PORT` | حسب الاستضافة | منفذ الخادم |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | **مطلوبان لعمل OTP** | إرسال رموز التتبع عبر Meta. بدونهما يُرجع الخادم في الإنتاج «رمز التحقق غير متاح» |
| `WHATSAPP_ADMIN_NUMBER`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` | اختيارية | إشعار الإدارة وقالب Meta المعتمد |
| `TRIP_API_URL`, `TRIP_API_TOKEN` | اختيارية | مزوّد الطيران؛ بدونهما لا يُدّعى وجود رحلات خارجية |
| `PROVIDER_EMAIL_TRANSPORT`, `PROVIDER_EMAIL_API_URL`, `PROVIDER_EMAIL_API_KEY` | اختيارية | إرسال حزم المزوّدين |
| `API_RATE_LIMIT`, `API_SESSION_RATE_LIMIT`, `LOGIN_IP_FAILURE_LIMIT` | اختيارية | حدود المعدّل (الافتراضات آمنة) |
| `PUBLIC_CONTACT_RATE_LIMIT` | **لا تُضبط في الإنتاج** (تُتجاهل فيه) | يرفع حد إرسال الطلبات العامة؛ يُقرأ فقط عند `NODE_ENV=test` أو `development` (الافتراضي 5 كل 15 دقيقة) |
| `TRACKING_CODE_RATE_LIMIT` | **لا أثر لها في الإنتاج** | يرفع حد طلب رمز التتبع فقط عندما `NODE_ENV` = `test` أو `development` (الاختبارات وبيئة E2E). في الإنتاج يبقى الحد 5 كل 15 دقيقة حتى لو ضُبطت بالخطأ؛ والقيم غير الصحيحة (ليست عددًا صحيحًا 1–1000) تُتجاهل |
| `STARTUP_DB_ATTEMPTS`, `STARTUP_DB_RETRY_DELAY_MS`, `DB_COMPAT_ACKNOWLEDGED_MIGRATIONS` | اختيارية | سلوك الإقلاع والتوافق (انظر `docs/admin-remediation-release.md` على فرع #86) |

## الموقع (Vercel)
`NEXT_PUBLIC_API_URL` — عنوان الـAPI. (`VERCEL_ENV` تضعه Vercel.)

## تطبيق أندرويد (GitHub Actions)
**Secrets (توقيع الإصدار النهائي فقط):** `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
**Variables:** `MOBILE_API_BASE_URL` (إنتاج فقط — لا يُضبط حتى يقدّم المالك العنوان الموثَّق), `ANDROID_RELEASE_CERT_SHA256`, `ANDROID_VERSION_CODE_BASE` (اختياري).
متغيرات يضبطها الـworkflow داخل خطوة البناء فقط: `NASAEM_RELEASE_KEYSTORE`, `NASAEM_RELEASE_STORE_PASSWORD`, `NASAEM_RELEASE_KEY_ALIAS`, `NASAEM_RELEASE_KEY_PASSWORD`.
الاختبار والبناء التجريبي يستخدمان staging من `mobile/www/js/config.js` ويُظهران شارة «بيئة اختبار» (لا تظهر في بناء الإنتاج).

## الاختبارات/CI (محلية أو GitHub، ليست إنتاجًا)
`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN` (يشمل `http://localhost:8081` لتطبيق العميل في E2E), `SEED_ADMIN_PASSWORD`, `API_RATE_LIMIT`, `PUBLIC_CONTACT_RATE_LIMIT`, `TRACKING_CODE_RATE_LIMIT`, `PLAYWRIGHT_CHROMIUM_PATH` (اختياري).
