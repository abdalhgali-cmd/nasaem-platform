# خطة إعادة تشغيل موقع الإنتاج على Railway بديلًا عن Vercel (4 نوفمبر 2026)

**الحالة:** خطة فقط. لم يُنشأ شيء على Production، ولم يتغير DNS. كل خطوة على Production تحتاج موافقة المالك.

## 1. الوضع الحالي (تحققتُ منه في 4 نوفمبر)

**الموقع على `nasaem-alharamain.com`:**
- يرد بـ**402** على كل الصفحات: الرئيسية، و`/umrah`، والموافقة المصرية، و`/track`، و`/admin/login`.
- السبب: حساب Vercel موقوف.
- التحقق من [فحص الإنتاج للقراءة فقط](https://github.com/abdalhgali-cmd/nasaem-platform/actions/runs/41399818073).

**الـAPI في الإنتاج يعمل:** `nasaem-platform-production.up.railway.app/api`، ومتصل بقاعدة البيانات.

**موقع Staging على Railway يعمل فعلًا**، وهو دليل على أن الطريقة تنجح:
- الخدمة: `nasaem-website-staging`.
- إعداداتها:
  - مجلد الجذر `/web`؛
  - أداة البناء Railpack؛
  - أمر التشغيل `npm run start -- --hostname 0.0.0.0 --port $PORT`.
- الصفحات التي ترد بـ200: الرئيسية، و`/umrah`، والموافقة المصرية، و`/track`، و`/admin`، و`/admin/login`.

**الكود جاهز** في #157، ضمن فرع التكامل #162:
- `web/railway.json`: أوامر البناء والتشغيل، وفحص الصحة `/healthz`، وإعادة التشغيل عند الفشل.
- `next.config.ts`: البناء على Railway يتوقف برسالة واضحة إن غاب `NEXT_PUBLIC_API_URL`.
- `NEXT_PUBLIC_PRODUCTION_WEB_HOSTS`: يسمح لنطاق Railway الجديد بالاتصال بـAPI الإنتاج. بدونه يرفض الموقع هذا الاتصال حماية.

## 2. الخطوات (بالترتيب، وكلها تحتاج موافقة المالك)

1. **شرط مسبق:** نسخة احتياطية حقيقية لقاعدة الإنتاج وملفاتها، مع اختبار استرجاع ناجح.
   - تُنفَّذ بالطريقة نفسها التي نُفذت في Staging (`ops-db-backup`)، دون فتح القاعدة للإنترنت.
2. **دمج #162 في `main`.**
   - ينشر الـAPI ويشغّل الترحيل الإضافي `20261102120000`.
   - يعمل فحص `DATABASE_URL` قبل الترحيلات.
   - تبقى الأسعار معلّمة «تجريبية» إلى أن يُضبط `PRICES_APPROVED=true`.
3. **إنشاء خدمة الموقع في `spirited-luck / production`:**
   - **New** ← **GitHub Repo** ← `abdalhgali-cmd/nasaem-platform`، والفرع `main`، ومجلد الجذر `/web`.
   - المتغيرات:

     | المتغير | القيمة |
     |---|---|
     | `NEXT_PUBLIC_API_URL` | `https://nasaem-platform-production.up.railway.app/api` |
     | `NEXT_PUBLIC_PRODUCTION_WEB_HOSTS` | نطاق الخدمة الجديد، مثل `nasaem-website-production.up.railway.app`، ثم `nasaem-alharamain.com` بعد نقل DNS |
     | `NODE_ENV` | `production` |
     | `NEXT_TELEMETRY_DISABLED` | `1` |

   - **لا تضع** `DEPLOYMENT_ENVIRONMENT` ولا `ENVIRONMENT_ATTESTATION_KEY` على الإنتاج.
4. **في خدمة API الإنتاج:**
   - أضف نطاق الموقع الجديد إلى `CORS_ORIGIN`، بصيغة `https://…` ومفصولًا بفاصلة.
   - هذا تغيير في متغيرات الإنتاج، ويحتاج موافقتك.
5. **اختبار على نطاق `*.up.railway.app` قبل DNS:**
   - الصفحات: الرئيسية، و`/umrah`، و`/visas/egypt-security-approval`، و`/track`، و`/admin/login`؛
   - دخول موظف؛
   - طلب تجريبي واحد يُحذف بعد الاختبار.
   - يمكن أتمتة الفحص بتوسيع `production-readonly-health.yml` لقراءة النطاق الجديد.
6. **نقل DNS** لـ`nasaem-alharamain.com` من Vercel إلى Railway، وهو قرار منفصل:
   - **Settings** ← **Networking** ← **Custom Domain** في خدمة الموقع؛
   - ثم سجلات CNAME أو A لدى مزوّد النطاق كما يعرضها Railway؛
   - انتظر شهادة TLS، ثم أضف النطاق إلى `NEXT_PUBLIC_PRODUCTION_WEB_HOSTS` و`CORS_ORIGIN`، وأعد بناء الموقع.
7. **بعد النقل:** فحص القراءة فقط على `nasaem-alharamain.com` يجب أن يُظهر 200 في كل الصفحات.

## 3. المخاطر وطرق تقليلها

| الخطر | التخفيف |
|---|---|
| `NEXT_PUBLIC_API_URL` يُقرأ وقت البناء | تغييره يحتاج إعادة بناء، والبناء يتوقف إن غاب المتغير |
| جلسة الموظف بين نطاقين مختلفين تحت `up.railway.app` (Safari يمنع ملفات تعريف الارتباط) | الحل الدائم نطاق API تحت نطاق الموقع، مثل `api.nasaem-alharamain.com` |
| إعادة نشر من إعداد محفوظ تبني commit قديمًا | تحقق أن الخدمة تتابع الفرع ولا تثبّت commit بعينه. في Staging ما زال الإعداد يثبّت `cb0edc3` |
| أسعار تجريبية تظهر كنهائية | لا تضبط `PRICES_APPROVED` قبل اعتماد الأسعار |

## 4. تقدير الوقت
- إنشاء الخدمة والمتغيرات والبناء: نحو 30 دقيقة.
- اختبار النطاق المؤقت: نحو 30 دقيقة.
- نقل DNS: من دقائق إلى ساعات، بحسب مزوّد النطاق.
