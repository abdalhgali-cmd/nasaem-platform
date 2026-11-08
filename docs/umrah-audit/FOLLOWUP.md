# سجل المتابعة — تنفيذ خطة العمرة

كل دفعة على فرع مستقل وDraft PR صغير؛ لا دمج ولا نشر ولا migration حية. الأرقام نتائج تشغيل فعلي على PostgreSQL اصطناعي (`127.0.0.1:55432/nasaem_umrah_t02`، مُهاجَر ومُزرَع محليًا).

## T02 — لقطة التزامات الباقة (فرع `fix/umrah-t02-package-snapshot-20261108`، مبني على #172)

- **التصميم:** لا schema جديد. يُخزَّن `intakeData.umrahPackage = {kind, includesServices, serviceId, source:"SNAPSHOT", capturedAt}` عند إنشاء الطلب في المسارين (multipart `POST /contact-requests` وإرسال المسودة)، من الخادم فقط؛ أي `umrahPackage` يرسله العميل في `intakeData` يُحذف.
- **القراءة:** `umrahObligations(request)` في `umrah-packages.js` تعتمد اللقطة الصالحة (التسليم، شرط الخدمات، وضع حجز التذاكر، نوع الباقة في «رحلتي»، تقدم الطلب). اللقطة المشوهة أو غير المتسقة تُتجاهل.
- **Provenance للطلبات القديمة:** طلب بلا لقطة يقرأ الكتالوج الحي ويحمل `obligationSource: "LEGACY_CATALOG"` في `evaluateUmrahDelivery`؛ لا تُكتب اللقطة بأثر رجعي ولا يُعد ذلك حقيقة تاريخية. مسار المراجعة: الموظف يرى المصدر ويحسم الطلبات القديمة المفتوحة يدويًا.
- **الاختبارات:** `tests/umrahPackageSnapshot.test.js` 7/7 (وحدة: بناء/ثبات/عكس/قديم/لقطة تالفة؛ تكامل: المساران، تعديل الباقة إلى VISA_ONLY بعد التقديم لا يغير الالتزام، طلب غير عمرة بلا لقطة). مجموعة الصلة (umrah* وintakeDraft* وdraftPrivacy وcontactRequest* وworkflow* وstaffServiceQueues وrequestProgress): **199/199**.
- **مستثنى/معروف:** `umrahActivationScript.test.js` يفشل (2) قبل التغيير أيضًا على هذه البيئة (الإنهاء برمز Windows 3221226505)؛ لم يُعدَّل. اختبار probe `known defect U-02` في `audit-probes.test.mjs` يبقى فاشلًا عمدًا لأن طلبه بلا لقطة (مسار LEGACY)؛ الإصلاح مغطى باختبارات اللقطة.
- **ملاحظة بيئة:** المسار تحت مجلد `.claude` يجعل `send` يعيد 404 لتنزيل الملفات؛ شغّل الاختبارات مع `UPLOAD_ROOT` خارج المستودع.
- **NOT TESTED:** Android المثبت، staging/production، بيانات حية. طلبات الإنتاج القائمة تبقى LEGACY_CATALOG حتى قرار مراجعة.
