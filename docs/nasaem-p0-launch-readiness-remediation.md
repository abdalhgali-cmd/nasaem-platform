# NASAEM — P0 Launch Readiness Remediation

**Repository:** `abdalhgali-cmd/nasaem-platform`  
**Base main:** `060c7e3814f64e2ccba48e59d57d325cd69bf714`  
**Branch:** `feature/launch-readiness-remediation`  
**Mode:** Remediation داخل المستودع فقط؛ لا نشر، لا Production migrations، لا Production configuration.

## 1. Executive Summary

تم تنفيذ الإصلاحات التي يمكن تنفيذها بأمان من طبقة التطبيق، مع عدم اختراع أسعار أو باقات أو مزودي دفع أو مخزون موردين أو سياسات قانونية. أصبحت الواجهة أكثر صدقًا بشأن نموذج التشغيل الحالي: **طلب → مراجعة وتوفر → عرض → اعتماد → دفع يدوي عند طلبه → مراجعة الموظف**. كما أضيفت بنية صفحات قانونية placeholder واضحة، وتحسن منع الفهرسة للصفحات الخاصة، وإخفاء أخطاء الخادم الداخلية، ومعالجة بعض حالات التحميل غير المنتهية.

لا تزال NASAEM **غير جاهزة للإطلاق العام** لأن البيانات التجارية الحقيقية والنصوص القانونية المعتمدة وإثبات النسخ والاستعادة والمراقبة والتكاملات الخارجية لم يتم التحقق منها أو توفيرها. لا يجوز اعتبار وجود هذه التغييرات موافقة على الإطلاق.

## 2. What Was Fixed

| المجال | الإصلاح |
|---|---|
| Visa pricing | لا تعرض بطاقة التأشيرة `0 SAR` كسعر حقيقي. عند غياب سعر موجب منشور تعرض أن التكلفة تحدد بعد مراجعة الطلب. |
| Flights | أزيلت أسعار المسارات التجريبية والعبارات التي توحي بتأكيد فوري. أصبح القسم يشرح طلب العرض ومراجعة التوفر. |
| Umrah | عُدلت اللغة من تأكيد الحجز خلال 24 ساعة إلى طلب عرض ومراجعة التوفر وإكمال الإجراءات. |
| Trust content | أزيلت إحصاءات العملاء والتقييمات وشهادات الأفراد غير الموثقة من الواجهة العامة، واستُبدلت بمبادئ خدمة محايدة قابلة للإثبات. |
| Legal structure | أضيفت `/privacy` و`/terms` و`/cancellation` و`/refund` و`/payment-information` كصفحات placeholder صريحة، دون نص قانوني مختلق. |
| Footer | أضيفت روابط الصفحات القانونية، وخُففت عبارات trust غير المثبتة. |
| Consent hooks | أضيف disclosure قبل إرسال طلب التواصل وقبل رفع أو إعادة رفع المستندات، مع ربط الخصوصية والشروط والتنبيه إلى أن النص المعتمد مطلوب قبل الإطلاق. |
| Error handling | أخطاء 5xx في Production تعيد رسالة آمنة بدل رسائل الملفات أو Prisma أو التفاصيل الداخلية؛ التفاصيل تبقى في server logs. |
| Loading UX | أضيف timeout إلى Customer Account وtracking session check، مع حالة error وretry. كما أصبح فشل حسابات الدفع العامة قابلًا لإعادة المحاولة بدل الإخفاء الصامت. |
| Private SEO | أضيف noindex/nofollow لمساحات `/account` و`/admin`، وأضيف disallow لهما في robots. |
| Canonical | تم توحيد canonical/sitemap domain إلى `https://nasaem-alharamain.com`، وهو الدومين العام الذي تم فحصه. |

## 3. What Was Verified

تم تشغيل الاختبار المباشر `backend/tests/errorMiddleware.test.js` بنجاح. كما نجح lint للملفات المعدلة، ونجح `npx tsc --noEmit` و`npm run build` في مجلد الويب. أظهر build صفحات legal الجديدة وaccount/admin layouts ضمن المخرجات.

فشل تشغيل كامل backend محليًا قبل الوصول إلى جميع الاختبارات لأن بيئة الاختبار المحلية لا تحتوي متغير الاختبار `SEED_ADMIN_PASSWORD`. هذا ليس فشل assertion في remediation، ولا تم اختلاق قيمة أو طباعة أي environment variable. يلزم تشغيل المجموعة الكاملة داخل CI أو بيئة اختبار مهيأة وفق README، دون استخدام Production.

أظهر lint الشامل للمستودع أخطاء موجودة في ملفات أخرى خارج نطاق remediation، بينما اجتازت الملفات المعدلة lint الموجه. يجب اعتبار CI هو معيار القبول النهائي للـPR.

## 4. Commercial Data Required — Owner Checklist

### Umrah Package

- الاسم العربي والإنجليزي إن لزم.
- السعر الحقيقي والعملة.
- المدة.
- الفندق أو مستوى الإقامة.
- النقل.
- الخدمات المشمولة والمستثناة.
- الصورة المرخصة.
- تاريخ البداية والنهاية إن كان العرض موسميًا.
- شروط التوفر والتعديل.
- اعتماد النشر من المالك.

### Visa

- الدولة.
- نوع التأشيرة.
- السعر الحقيقي والعملة، أو قرار واضح بأن السعر يحدد بعد مراجعة الطلب.
- مدة المعالجة المعتمدة.
- مدة الصلاحية ومدة الإقامة.
- نوع الدخول.
- قائمة المتطلبات المعتمدة.
- قيود الجنسية أو الحالة إن وجدت.
- تاريخ السريان والانتهاء.
- اعتماد النشر من المالك.

### Services and Contact

- أسماء الخدمات ووصفها النهائي.
- الهاتف وWhatsApp والبريد والعنوان وساعات الدعم.
- القنوات الاجتماعية المراد نشرها.
- اللغة التجارية المعتمدة لكل CTA.

لا يجوز إدخال أي قيمة من هذه القائمة تلقائيًا أو تخمينيًا.

## 5. Payment Position and Limitations

المنصة الحالية لا تثبت وجود payment gateway معتمد. المسار الموجود هو عرض أو فاتورة، ثم تعليمات تحويل أو رفع إثبات، ثم مراجعة موظف. لذلك يجب أن تبقى الواجهة خالية من وعود الدفع الفوري أو الحجز المؤكد أو إصدار التذكرة تلقائيًا.

قبل إضافة مزود دفع، يجب على المالك توفير اسم المزود المعتمد، عقد الحساب، العملات، بيئة sandbox، webhook signing، success/failure URLs، idempotency policy، lifecycle للحالات، reconciliation، refund workflow، audit events، ومالك تشغيلي للمطابقة والاسترداد. لم يتم دمج مزود غير معتمد.

## 6. Supplier Position

لم يثبت وجود تكامل مورد حي للرحلات أو الفنادق أو مخزون العمرة أو إصدار التأشيرات. يجب تصنيف هذه المسارات حاليًا كطلب عرض ومراجعة يدوية، لا كـlive availability. يملك المسؤول التجاري قرار توفير provider API أو تعديل اللغة التجارية لكل مجال.

## 7. Legal and Document Input Required

الصفحات التقنية موجودة لكنها placeholder وnoindex. يجب أن يقدم المالك أو المراجع القانوني نصوصًا معتمدة لكل من الخصوصية والشروط والإلغاء والاسترداد ومعلومات الدفع، إضافة إلى الجهة القانونية، تاريخ السريان، النطاق الجغرافي، آلية التحديث، معلومات التواصل والشكاوى، سياسة ملفات تعريف الارتباط إن كانت مطلوبة، وإشعار رفع الجوازات.

يجب تحديد الغرض من المعالجة، أساسها، من يصل إلى الملفات، مكان التخزين، مدة الاحتفاظ، آلية الحذف أو طلب الوصول، نقل البيانات، التعامل مع القاصرين، وإجراءات خرق البيانات. لم يتم اختراع أي مدة أو التزام قانوني.

## 8. Security Findings

تم الحفاظ على customer/admin scopes وserver-side ownership وRBAC الموجودة. أضيف regression test يمنع تسريب رسالة 5xx داخلية في Production. صفحات account/admin غير قابلة للفهرسة. لم تُجرَ تغييرات على الأسرار أو المصادقة أو Production configuration.

يبقى على مالك التشغيل التحقق يدويًا من Secure cookies وCORS وCSRF posture وrate limit الفعلي في Railway، وMIME/size/quarantine/virus scanning للملفات، وlog redaction، وalert ownership. هذه عناصر لا يمكن إثبات إعدادها من repository وحده.

## 9. UX, Mobile, and Accessibility

تمت إضافة success/error/empty/retry states للمسارات التي عدلتها، مع أزرار قابلة للوحة المفاتيح وfocus-visible في disclosure والصفحات القانونية. RTL محفوظ في الواجهة العربية، والـbuild يثبت أن الصفحات الجديدة قابلة للتوليد.

يجب إجراء Mobile QA فعلي على Homepage وVisas وUmrah وPackages وWizard وLogin وAccount وTracking وDocuments وPayments وAdmin في Preview أو staging. لا يجوز اعتبار build بديلًا عن الاختبار البصري. يجب أيضًا تشغيل accessibility audit آلي أو يدوي، خصوصًا focus داخل dialogs، labels، error association، contrast، وحركة reduced-motion.

## 10. SEO Baseline

تم توحيد domain وsitemap، وإضافة noindex للمساحات الخاصة، وتحسين metadata للصفحات القانونية. ما يزال يلزم فحص Preview/Production بعد النشر من خلال headers وHTML النهائي، والتأكد من canonical وOG وtitle/description لكل صفحة عامة، وعدم فهرسة صفحات placeholder القانونية قبل اعتماد النص.

## 11. Infrastructure Checklist — Manual Owner Verification

### Railway

- [ ] production API URL: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] CORS_ORIGIN: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] `API_RATE_LIMIT` ليس 2000: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] DATABASE_URL: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] JWT/auth secrets: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] Secure cookie behavior: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] health status والـreplicas: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] logs وredaction: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] database backups وretention: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] restore drill: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] uptime/error/database monitoring: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] alert ownership: CONFIGURED / NOT CONFIGURED / UNKNOWN

### Vercel

- [ ] production domain: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] `NEXT_PUBLIC_API_URL`: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] HTTPS وDNS: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] deployment status: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] canonical domain: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] production/preview separation: CONFIGURED / NOT CONFIGURED / UNKNOWN
- [ ] no secrets printed in logs or client bundle: CONFIGURED / NOT CONFIGURED / UNKNOWN

## 12. Backup and Recovery Plan

يجب أن يشمل التشغيل المعتمد نسخة قاعدة بيانات دورية مشفرة، ونسخة من uploads/assets، retention يوافق عليها المالك، اختبار restore على بيئة معزولة، وسجلًا يثبت نجاح الاستعادة. **RPO وRTO والمالك المسؤول UNKNOWN** حتى يقدمها مسؤول البنية التحتية. لا يجوز اعتبار وجود Docker أو Prisma migration بديلًا عن backup.

## 13. Monitoring Minimum

| الطبقة | المقاييس المطلوبة | عتبات مقترحة وليست إعدادات حالية |
|---|---|---|
| API | uptime، latency، 4xx، 5xx، rate-limit events | تنبيه عند انقطاع متكرر، 5xx مستمر، أو ارتفاع latency عن baseline المتفق عليه |
| Database | connection errors، storage/CPU عند توفرها، failed queries | تنبيه عند فشل الاتصالات أو اقتراب السعة من الحد التشغيلي |
| Frontend | deployment failures، runtime errors، failed API calls | تنبيه عند فشل deploy أو تكرار runtime errors في public routes |
| Business | failed requests، failed uploads، payment review failures | تنبيه عند تراكم الحالات أو فشل الرفع/المراجعة فوق baseline |

هذه عتبات تصميمية مقترحة وليست دليلًا على أن monitoring مفعّل حاليًا.

## 14. Analytics Status and Safe Event Design

لم يثبت وجود analytics متكامل في نطاق التدقيق. إذا تم اعتماده لاحقًا، يمكن تصميم أحداث مثل `page_view` و`visa_view` و`package_view` و`request_started` و`request_submitted` و`account_created` و`offer_viewed` و`offer_accepted` و`payment_submitted` و`order_completed`.

لا يجوز إرسال جوازات أو محتوى مستندات أو كلمات مرور أو tokens أو ملفات إثبات الدفع أو أرقام هواتف غير لازمة. يجب تحديد retention وconsent ومالك البيانات قبل التفعيل.

## 15. Hard-coded Business Data Audit

| التصنيف | أمثلة | القرار |
|---|---|---|
| ADMIN CONTROLLED | Services، Visa Types، Umrah Packages، prices، contact settings، social settings، public SEO defaults | موجود جزئيًا عبر Service/Settings APIs؛ يلزم إدخال بيانات واعتمادها |
| OWNER INPUT REQUIRED | FAQ، testimonials، statistics، certifications، refund/legal copy، supplier claims | لا تُنشر قبل التحقق والاعتماد |
| DEVELOPER CONTROLLED | auth secrets، database URLs، provider keys، CORS/security defaults، code routing، schema/migrations | تبقى خارج CMS ولا تُعرض للإدارة العامة |
| أزيلت من public copy | flight sample prices، customer counts، ratings، individual testimonials، instant confirmation claim | استبدلت بلغة تشغيلية محايدة |

## 16. End-to-End Readiness

| الرحلة | الحالة |
|---|---|
| Customer Homepage → Visa → Request | موجودة، مع اعتماد السعر/المتطلبات والـworkflow على بيانات الإدارة |
| Customer → Account → Documents → Offer → Payment proof → Tracking | موجودة جزئيًا ومحمية بالملكية server-side؛ الدفع والمراجعة يدويان |
| Admin → Review → Pricing → Offer → Payment review → Delivery | workflow موجود في التطبيق، ويحتاج تحقق staging وتشغيل تشغيلي حقيقي |
| Admin → Create Umrah Package → Publish → Public package | المسار مدعوم في الكود؛ يحتاج إدخال package حقيقي واعتماد publish |
| Flight/Hotel live booking | غير مثبت؛ SUPPLIER INTEGRATION REQUIRED |
| Payment gateway | غير مثبت؛ APPROVED PROVIDER REQUIRED |

## 17. Database Readiness

لم تُنشأ migration في remediation. لا يوجد طلب لتغيير Production schema. يجب قبل أي deployment معتمد مقارنة `prisma migrate status` في بيئة غير إنتاجية، مراجعة ترتيب migrations، اختبار compatibility، أخذ backup، وتحديد rollback strategy. لا تُنفذ أوامر migration على Production ضمن هذا العمل.

أوامر النشر المستقبلية التالية أمثلة إجرائية فقط، ولا يجوز تنفيذها قبل موافقة منفصلة وbackup ونافذة صيانة:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
cd backend
npm ci
npx prisma migrate deploy
npm run prisma:generate
npm test
```

## 18. P0 / P1 / P2

### P0 — MUST FIX BEFORE PUBLIC LAUNCH

- إدخال واعتماد أسعار Visa الحقيقية أو اعتماد نموذج السعر بعد المراجعة لكل نوع.
- إدخال واعتماد Umrah packages الحقيقية ونشرها من Admin بعد تحقق owner.
- اعتماد legal/privacy/document handling copy ونشر الصفحات القانونية بعد المراجعة.
- تنفيذ backup وrestore drill مع RPO/RTO وretention وowner موثقين.
- تفعيل والتحقق من uptime/error/database monitoring وalert ownership.
- قرار صريح من المالك بأن التشغيل اليدوي الحالي مقبول، أو اعتماد payment gateway/provider integration قبل أي وعد بالدفع أو الحجز الفوري.
- قرار supplier availability: تكامل حي موثق أو لغة public صريحة بأنها quote/manual request.

### P1 — IMPORTANT BUT CAN FOLLOW CONTROLLED LAUNCH

- page-specific SEO وOG مع فحص domain نهائي.
- structured FAQ/Navigation/Testimonials/Stats/CMS sections.
- accessibility audit كامل وmobile QA موثق في Preview/staging.
- analytics مع consent وprivacy review.
- automated backup verification and alert dashboards.
- structured passenger/passport and supplier models إذا توسع المنتج خارج manual request.

### P2 — FUTURE

- payment gateway وwebhooks وreconciliation/refunds.
- flight/hotel/Umrah supplier APIs.
- workflow builder وdraft/preview/publish versioning.
- advanced notifications and operational analytics.
- service-specific status machines and automated ticket/voucher delivery.

## 19. Scorecard

التقييم الجديد تقديري مبني على evidence repository والاختبارات الحالية، وليس شهادة تشغيل Production:

| المحور | التقييم |
|---|---:|
| UX/UI | 7.5/10 |
| Conversion | 6.8/10 |
| Customer Account | 7.5/10 |
| Admin | 8.0/10 |
| Security | 7.4/10 |
| Architecture | 7.8/10 |
| Performance | 7.0/10 |
| Mobile | 6.8/10 |
| SEO | 7.0/10 |
| Operations | 5.6/10 |
| Production readiness | 5.8/10 |
| Overall | 7.2/10 |

مقارنة بالتقييم السابق `Overall 7.0/10` و`Production readiness 5.5/10`: تحسن التطبيق في صدق اللغة، private SEO، error handling، والـloading UX، لكن بقيت بوابات P0 الخارجية دون إثبات.

## 20. Exact Owner Actions

1. أدخل بيانات الأسعار والباقات والتأشيرات الحقيقية عبر Admin، ثم اختبر public APIs والـempty/disabled states في staging.
2. وقع على النصوص القانونية وإشعار المستندات، ثم استبدل placeholders فقط بعد اعتمادها.
3. قرر كتابيًا نموذج الدفع: manual quote/review أو provider معتمد؛ لا تستخدم لغة instant payment قبل القرار.
4. قدم أسماء المزودين وبيانات التكامل المعتمدة أو وافق على أن Flights/Hotels/Umrah inventory manual request فقط.
5. تحقق من Railway وVercel وفق checklists أعلاه، وسجل CONFIGURED/NOT CONFIGURED/UNKNOWN فقط.
6. نفذ backup وrestore drill خارج Production أولًا، وحدد retention وRPO وRTO والمالك.
7. فعّل monitoring والalerts ودوّن thresholds والجهة التي تستجيب للحوادث.
8. شغّل CI الكامل على PR remediation، ثم Mobile/Accessibility QA في Preview أو staging.
9. لا تطلق public traffic حتى تُغلق كل P0 أو يصدر owner controlled launch decision موثق ومحدود النطاق.

## 21. PR and Compliance

**PR:** سيُنشأ PR واحد من `feature/launch-readiness-remediation` بعد اكتمال الاختبارات المسموح بها.  
**Merge:** ممنوع ضمن هذه المهمة.  
**Deploy:** ممنوع ضمن هذه المهمة.  
**Production migrations:** ممنوعة ضمن هذه المهمة.  
**Final decision:** `NOT READY FOR PRODUCTION` حتى إغلاق أو قبول P0 بقرار controlled launch موثق.

## Finalization Addendum

تمت معالجة آخر مصادر claims غير الموثقة في الواجهة العامة. أزيلت أرقام الإحصاءات من Homepage وAbout واستُبدلت بخطوات تشغيلية أو محتوى محايد. أزيلت عبارات الثقة والخبرة والشراكات غير المثبتة من About، مع إبقاء الصفحة مفيدة عبر شرح مسار الطلب والمراجعة والعرض والمتابعة.

أصبح قسم FAQ يستخدم `HomepageSection` الموجود أصلًا: مفاتيح `faq:category:slug` تعرض السؤال من `title` والإجابة من `description` بعد التفعيل والترتيب عبر Content Manager. عند غياب محتوى معتمد يعرض القسم empty state صريحة بدل إجابات تجارية ثابتة. كما يدعم قسم الإبرازات مفاتيح `stat:slug` عبر المصدر نفسه، لكنه لا يعرض أرقامًا إلا إذا بنيت لها بنية بيانات معتمدة مستقبلًا؛ fallback الحالي خطوات تشغيلية غير رقمية.

أضيفت إرشادات داخل Content Manager لاستخدام مفاتيح FAQ وStat الآمنة، مع تنبيه بعدم إدخال أرقام أو claims غير موثقة. لم تتم إضافة schema أو migration أو نموذج CMS موازٍ.

### Updated Verification

نجحت مجددًا الاختبارات الموجهة، وlint للملفات المعدلة، و`npx tsc --noEmit`، و`npm run build` بعد هذه الإضافات. يبقى CI الكامل معيار القبول النهائي بعد رفع commit الجديد إلى PR #42.

### Final Decision

`APPLICATION READY FOR CONTROLLED STAGING / OWNER REVIEW`

هذا لا يعني `READY FOR PUBLIC PRODUCTION`. بوابات المالك الخارجية، القانونية، والبنية التحتية والدفع والموردين ما زالت مطلوبة قبل الإطلاق العام.

## Release Documentation Added

أضيفت وثائق `docs/STAGING_READINESS_CHECKLIST.md` و`docs/PRODUCTION_READINESS_CHECKLIST.md` و`docs/PRODUCTION_RUNBOOK.md`. تحتوي الأولى على اختبارات staging لكل رحلة مع `EXPECTED / ACTUAL / STATUS / OWNER`، وتوضح الثانية بوابات الإطلاق وتصنيف `PASS / FAIL / UNKNOWN / OWNER INPUT REQUIRED`، بينما يوضح الـrunbook pre-deployment وdeployment وsmoke tests وrollback وincident response وbackup/restore وmonitoring وإجراء أثر العميل. جميعها إرشادية فقط؛ لم يُنفذ أي Deployment أو Migration أو Restore على Production.
