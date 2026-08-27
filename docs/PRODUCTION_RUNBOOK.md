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
