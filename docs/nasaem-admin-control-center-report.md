# تقرير تنفيذ NASAEM Operations & Admin Control Center

## 1. الملخص التنفيذي

تم تنفيذ مرحلة **Operations & Admin Control Center** على الفرع `feature/admin-control-center` فوق البنية الحالية للمشروع، دون إنشاء Architecture موازية ودون تغيير Admin Login أو تشغيل migrations إنتاجية أو نشر Production. أضيفت طبقة AdminShell عربية متجاوبة، وصفحات إدارة موصولة بعقود API وPrisma الموجودة، مع إبقاء القواعد الحساسة والتحقق النهائي داخل الخادم.

الفرع النهائي هو `08eddd4590e858757704a382c413d05b5cfa6960`، وتم إنشاء PR مفتوح للمراجعة: [PR #41](https://github.com/abdalhgali-cmd/nasaem-platform/pull/41).

## 2. الوظائف المعاد استخدامها

اعتمد التنفيذ على `User` وenum الأدوار الحالي، و`Service` و`VisaType` و`VisaRequirement`، و`UmrahGroup` مع علاقات `Customer` و`Order`، و`Payment`، و`Document`، و`Offer`، و`ActivityLog`، و`Setting`، و`FeatureFlag`، و`SiteAsset`. لم تتم إضافة نموذج Customer أو Order أو Service أو Package أو Permission مكرر.

| المجال | ما تم توصيله | القرار البنيوي |
|---|---|---|
| الموظفون | قائمة، بحث، حالة، إنشاء، تغيير الدور | endpoint جديد محدود بـSUPER_ADMIN فقط لتغيير الدور؛ لا schema change |
| الخدمات | CRUD، السعر، الحالة، الميزات، صورة الخدمة | إعادة استخدام Service وendpoint الصورة الحالي |
| التأشيرات | التأشيرات والتصنيف والمتطلبات | إعادة استخدام VisaType/VisaRequirement مع بقاء filtering الخادمي |
| العمرة | مجموعات تشغيلية وأعضاء | إعادة استخدام UmrahGroup وCustomer وOrder |
| الباقات | إنشاء باقة ضمن Service | category=`UMRAH_PACKAGE` وfeatures منظمة؛ لا inventory وهمي |
| الأسعار | Service وVisaType وOffer | الأسعار التاريخية للطلبات لا تُعدّل من شاشة الكتالوج |
| الموافقات | طابور مدفوعات وتشغيل | confirm/reject الحاليان فقط؛ لا انتقالات عشوائية |
| المحتوى والمظهر | Homepage وtheme tokens | استخدام Setting/Homepage/Theme APIs الحالية |
| الوسائط | بحث ومعاينة ورفع asset بمفتاح whitelist | فصل الأصول العامة عن مستندات العملاء الخاصة |
| التدقيق | Activity Log | عرض metadata المنقحة دون أسرار أو bytes حساسة |

## 3. صفحات Admin الجديدة

أضيفت صفحات: `/admin/operations`, `/admin/users`, `/admin/roles`, `/admin/services`, `/admin/visas`, `/admin/umrah`, `/admin/pricing`, `/admin/approvals`, `/admin/assignments`, `/admin/documents`, `/admin/workflow`, `/admin/features`, `/admin/content`, `/admin/appearance`, `/admin/media`, `/admin/settings`, و`/admin/activity`. كما تم توحيد shell والتنقل والخروج وعرض الدور الحالي، مع إبقاء صفحات الإدارة القديمة متاحة.

## 4. RBAC والصلاحيات

تظل `requireAuth` و`requireRole` في الخادم مصدر التفويض النهائي. الواجهة تخفي الإجراءات غير المتاحة لتحسين التجربة فقط، ولا تعتمد عليها كحاجز أمني. المسار الجديد `PATCH /api/users/:id/role` مقصور على `SUPER_ADMIN`، ويمنع خفض دور الحساب الحالي ويحمي آخر حساب `SUPER_ADMIN`. يستطيع `ADMIN` قراءة المستخدمين وتعديل الحالة وفق المسار الحالي، لكنه لا ينشئ موظفًا جديدًا ولا يغير الأدوار.

| الدور | المستخدمون | الخدمات/المحتوى | التأشيرات | العمرة | المدفوعات | سجل النشاط |
|---|---|---|---|---|---|---|
| SUPER_ADMIN | إدارة كاملة | إدارة كاملة | إدارة كاملة | إدارة كاملة | موافقات | قراءة |
| ADMIN | قراءة وتحديث الحالة | إدارة | إدارة | إدارة | موافقات | قراءة |
| EMPLOYEE | تشغيل الطلبات والعمرة والإسناد | — | — | تشغيل | — | — |
| ACCOUNTANT | قراءة الطلبات والمستندات | — | قراءة | قراءة | موافقات | — |
| CONTENT_MANAGER | — | خدمات ومحتوى ومظهر ووسائط | تأشيرات ومتطلبات | — | — | — |

هذه مصفوفة واجهة مبسطة تعكس حدود routes الحالية؛ لم تتم إضافة granular permission table غير موجودة في schema الحالي، ولذلك تبقى الصلاحيات enum-based ومطبقة خادميًا.

## 5. العمرة والباقات والتسعير

يدير Umrah Manager المجموعات وأعضاءها وفق قواعد `UmrahGroup` الحالية، بما في ذلك اتساق العضو مع Customer وOrder. لا توجد في البنية الحالية محركات مستقلة للفنادق أو الرحلات أو السعة أو المخزون، ولذلك لم يتم اختراع بيانات أو تكاملات. Package Builder يحفظ الباقة كـService من فئة `UMRAH_PACKAGE` ويضع العناصر المشمولة وغير المشمولة في features منظمة، وبذلك يستفيد من catalog وpricing الحاليين دون نموذج جديد.

## 6. Workflow وAssignments

تعرض صفحة Workflow الحالات التشغيلية الآمنة وتوضح أن الانتقالات تظل محمية بواسطة `updateOrderStatus` و`OrderStatusHistory` في backend؛ لم تُفتح واجهة تسمح بإنشاء انتقالات غير صالحة. صفحة Assignments تستخدم `PATCH /orders/:id/assign` الحالي لإسناد الطلب إلى موظف نشط، وتعرض الطلب والعميل والخدمة والحالة والموظف المسند دون كشف مسارات ملفات خاصة.

## 7. التغييرات الخلفية وقاعدة البيانات

أضيفت خدمة وvalidator وcontroller ومسار تغيير دور الموظف، مع اختبارات RBAC. لم تتغير `schema.prisma` ولم تُنشأ أي migration. لا يوجد `DROP` أو `TRUNCATE` أو `prisma db push` أو اتصال بقاعدة Production. لم تتغير بيانات Order أو الأسعار التاريخية أو Customer Account Center.

## 8. الأمن والمراجعة

تمت مراجعة عدم عرض password hashes أو tokens أو API keys أو private file bytes في الواجهات الجديدة. الوصول إلى مستندات العملاء بقي خلف routes الحالية، والواجهة الجديدة تعرض metadata فقط. بقي فصل Finance عن Content Manager قائمًا، ولا تستطيع أدوار التشغيل العادية ترقية نفسها إلى `SUPER_ADMIN`. فحص diff لم يظهر ملفات schema أو migrations أو environment أو production configuration.

## 9. نتائج الاختبارات

| الفحص | النتيجة | الملاحظة |
|---|---|---|
| Frontend typecheck | PASS | `npm run typecheck` |
| Frontend production build | PASS | `npm run build`، وتم توليد routes الإدارة الجديدة |
| Git diff check | PASS | لا توجد whitespace errors |
| Backend syntax | PASS | ملفات users المعدلة اجتازت `node --check` |
| Backend integration tests محليًا | غير قابل للتشغيل محليًا | البيئة لا تحتوي `DATABASE_URL` أو قاعدة اختبار seeded؛ لم يتم اختلاق اتصال أو استخدام Production |
| Playwright E2E محليًا | غير قابل للتشغيل محليًا | webServer backend أعاد 500 بسبب غياب `DATABASE_URL` ثم انتهت المهلة |
| PR CI Backend | PASS | فحص GitHub للـPR |
| PR CI Frontend | PASS | typecheck + build |
| PR Playwright E2E | PASS | فحص GitHub للـPR |
| Vercel Preview | PASS | deployment completed وPreview Comments ناجح |
| lint الكامل | يحتاج معالجة legacy | خطأ واحد موجود في `web/src/app/admin/payment-review/page.tsx`؛ ملفات Admin Control Center الجديدة بلا أخطاء lint بعد عزل التحميل الأولي المقصود |

## 10. PR والحالة النهائية

| البند | القيمة |
|---|---|
| PR | [#41](https://github.com/abdalhgali-cmd/nasaem-platform/pull/41) |
| الحالة | OPEN، MERGEABLE، غير Draft |
| Commit | `08eddd4590e858757704a382c413d05b5cfa6960` |
| Checks | 5 ناجحة، 0 فاشلة، 0 معلقة |
| Reviews | لا توجد مراجعات أو threads حاليًا |
| Branch | `feature/admin-control-center` |
| Production | لم يتم النشر |
| Merge | لم يتم الدمج |
| Working tree | CLEAN |

## 11. المتبقي قبل الدمج

المسارات الأساسية جاهزة للمراجعة وPR checks خضراء. المتبقي المعروف هو قرار مستقل بشأن خطأ lint legacy في `payment-review`، وتوفير بيئة اختبار seeded محلية إذا أُريد إعادة تشغيل integration/E2E خارج GitHub CI. كما أن workflow builder الكامل وversion history القابل للاسترجاع وgranular permissions ليست جزءًا من البنية الحالية؛ أبقيت هذه الحدود صريحة بدل بناء وظائف وهمية أو migrations كبيرة.

## المراجع

[1]: https://github.com/abdalhgali-cmd/nasaem-platform/pull/41 "NASAEM Operations & Admin Control Center — Pull Request #41"
[2]: https://github.com/abdalhgali-cmd/nasaem-platform "NASAEM Platform repository"
