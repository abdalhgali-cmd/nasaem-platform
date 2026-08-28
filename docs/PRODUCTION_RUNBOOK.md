# NASAEM — Production Runbook

> هذا runbook إجرائي للمراجعة والاعتماد. لا تُنفذ خطوات Deployment أو Migration أو Restore على Production من هذه المهمة. يجب أن ينفذها مالك البنية التحتية المخول وفق change window معتمدة.

## 1. Pre-deployment

تحقق من أن PR المعتمد يطابق commit المراجع، وأن CI أخضر، وأن working tree نظيف. راجع release notes وdatabase compatibility وenvironment contract دون طباعة القيم السرية. أكد وجود backup حديث قابل للاستعادة، وقياس RPO/RTO، ووجود rollback target. تحقق من legal/commercial/provider approvals قبل فتح الحجز أو الدفع.

سجّل أسماء المسؤولين عن التطبيق وقاعدة البيانات والبنية والدعم المالي والتشغيلي. جهز communication plan وحالة maintenance إن لزم، ولا تُدخل أسعارًا أو باقات أو بيانات اتصال غير معتمدة أثناء نافذة النشر.

## 2. Deployment

ينفذ Infra Owner النشر من pipeline المعتمد فقط، مع تثبيت commit وartifact قابل للتتبع. لا تُشغّل migrations تلقائيًا إلا بعد مراجعة additive/backward-compatible وخطة rollback واعتماد منفصل. راقب health/readiness والreplicas والـerror rate بعد النشر، ولا تعتبر deployment ناجحًا قبل smoke tests.

## 3. Smoke tests

نفذ على بيئة Production وفق سياسة المالك وببيانات غير حساسة: تحميل Homepage وVisa وUmrah وPackages، تحقق من RTL وcanonical وrobots وsitemap، تحقق من request flow دون إنشاء طلب تجاري حقيقي إن لم توجد موافقة، ثم تحقق من login/account ببيانات اختبار معتمدة فقط. لا ترفع وثائق حقيقية ولا payment proof ولا تستخدم حسابات العملاء.

تحقق من أن السعر غير المتاح يظهر كـ«السعر يحدد بعد مراجعة الطلب»، وأن النصوص لا توحي بحجز أو دفع فوري، وأن `/account` و`/admin` غير مفهرسين. سجّل status codes وlatency ووجود الأخطاء دون تخزين payloads حساسة.

## 4. Rollback

إذا ظهرت أخطاء حرجة في auth أو customer isolation أو payment/document security أو فقدان بيانات، أوقف التغيير وأبلغ Incident Owner. أعد التطبيق إلى آخر artifact مستقر عبر pipeline، ولا تستخدم database reset أو destructive migration. إذا كانت migration additive لكنها غير متوافقة، اتبع خطة rollback الموثقة؛ لا تحذف الجداول أو البيانات يدويًا.

بعد rollback، تحقق من health والـerror rate وlogin وpublic catalog وcustomer isolation، ثم افتح incident record يوضح السبب والنطاق والإجراء والتوصية.

## 5. Incident response

صنّف الحادث حسب أثره على العملاء والبيانات والأموال. اعزل endpoint أو capability المتضررة إن أمكن دون تعطيل العزل الأمني. لا تنشر secrets أو document contents أو payment proofs في logs أو قنوات التواصل. احفظ timestamps وcommit وrequest correlation identifiers غير الحساسة، وأشرك مالك الأمن عند أي احتمال IDOR أو تسريب.

أبلغ العملاء فقط بالمعلومات المؤكدة، ولا تعد بموعد أو استرداد أو توفر قبل قرار Operations/Finance/Legal. أغلق الحادث بعد root-cause review وverification وقرار follow-up.

## 6. Database backup verification

يؤكد Infra Owner نجاح آخر backup ومكان تخزينه وتشفيره وretention policy، ثم ينفذ restore drill في بيئة معزولة لا تؤثر على Production. قِس زمن الاستعادة وفقد البيانات المتوقع، وتحقق من سلامة العلاقات وhistorical order prices وprivate documents access. لا تعتبر وجود ملف backup دليلًا على قابلية الاستعادة دون drill موثق.

## 7. Monitoring

راقب uptime، API 4xx/5xx، auth failures، DB connectivity، upload failures، document/payment review failures، queue latency، storage capacity، وresource saturation. يجب أن تصل alerts إلى مالك مناوب مع severity وrunbook واضحين. لا تسجل كلمات المرور أو tokens أو passport numbers أو document/payment contents.

## 8. Customer-impact procedure

عند تعطل رحلة عميل، حدّد المرجع الداخلي دون كشفه علنًا، أوقف أي transition غير آمن، قدم قناة دعم واضحة، وسجل الإجراء في Activity Log المناسب. لا تعدّل Order history أو payment evidence يدويًا خارج المسار المصرح. بعد الإصلاح، تحقق من next action والإشعار والتسليم للعميل المتأثر.

## 9. Current execution boundary and evidence

تم تنفيذ preflight على repository وPR فقط: الفرع `feature/launch-readiness-remediation`، HEAD `54ce0761f407f9561d540532ee7fd6271d980a53`، working tree نظيف، PR #42 مفتوح ونظيف، وCI ناجح بخمس checks. هذا الدليل لا يثبت جاهزية Production ولا يستبدل evidence الخاص بالبنية التحتية.

لم تتوفر صلاحية أو URL لبيئة staging ضمن هذه المهمة، لذلك لم تُنشأ حسابات Customer A/B ولم تُنفذ طلبات أو uploads أو payment proofs أو restore drills. الحالة الصحيحة لاختبارات البيئة هي `STAGING ACCESS REQUIRED`، وتبقى backup وrestore وRPO/RTO وmonitoring وhealth وreplicas وrollback وincident owner بحالة `UNKNOWN` أو `INFRASTRUCTURE INPUT REQUIRED` حتى يقدم Infra Owner دليلًا فعليًا.

**MERGE: NOT PERFORMED**
**PRODUCTION DEPLOYMENT: NOT PERFORMED**
**PRODUCTION MIGRATIONS: NOT PERFORMED**
**PRODUCTION CONFIGURATION: NOT CHANGED**
**PRODUCTION CREDENTIALS: NOT USED**

## Launch-readiness audit addendum — 2026-08-28

### Safe release boundary

This runbook authorizes controlled Staging verification only. It does not authorize Production deployment, Production migrations, use of Production credentials, real customer payment data, or destructive rollback testing in Production. The release candidate must remain on PR #42 and branch `feature/launch-readiness-remediation` until the owner explicitly approves the remaining external gates.

### Rollback execution sequence

1. **Deployment:** record the immutable commit SHA, deployment URL, migration state, environment version, and health-check result.
2. **Detection:** capture the alert, affected route, tenant/customer scope if known, first occurrence, and supporting logs with secrets and PII redacted.
3. **Decision:** the incident owner decides rollback versus forward fix using impact, data integrity, payment state, and migration compatibility as criteria.
4. **Rollback:** redeploy the last known-good immutable artifact. Do not reverse database migrations automatically; use a separately reviewed forward-compatible remediation unless an approved restore plan exists.
5. **Verification:** check health, authentication, authorization, document access, payment state consistency, supplier queue state, logs, and smoke journeys. In Staging, repeat the synthetic A/B matrix after rollback.
6. **Communication:** notify the owner and operational stakeholders, record start/end times and customer impact, and preserve the incident evidence.

A rollback is **not technically verified** until this sequence has been executed successfully against a disposable Staging deployment. The current status is **INFRASTRUCTURE INPUT REQUIRED** because no such deployment or immutable artifact evidence was supplied.

### Unverified dependencies

Payment callbacks, supplier responses, database backup/restore, monitoring destinations, and tenant isolation must remain explicitly labeled **EXTERNAL VERIFICATION REQUIRED** or **BLOCKED** until tested with non-Production resources.
