# NASAEM — Production Runbook

> هذا runbook إجرائي للمراجعة والاعتماد. لا تُنفذ خطوات Deployment أو Migration أو Restore على Production من هذا العمل. يجب أن ينفذها مالك البنية التحتية المخول وفق change window معتمدة.

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

### Rollback execution sequence

1. **Deployment:** record immutable commit SHA, deployment URL, migration state, environment version and health result.
2. **Detection:** capture alert, affected route, customer scope if known, first occurrence and redacted supporting logs.
3. **Decision:** Incident Owner decides rollback versus forward-fix using customer impact, data integrity, payment state and migration compatibility.
4. **Rollback:** redeploy the last known-good immutable artifact. Never reverse database migrations automatically; use a separately reviewed remediation or approved restore plan.
5. **Verification:** check health, auth, authorization, customer isolation, document access, payment state consistency, supplier/manual workflow state and smoke journeys.
6. **Communication:** record start/end times, customer impact, decision owner and final evidence.

A rollback is not operationally PASS until this sequence has been executed successfully against a disposable non-Production backend/database environment.

## 5. Incident response

صنّف الحادث حسب أثره على العملاء والبيانات والأموال. اعزل endpoint أو capability المتضررة إن أمكن دون تعطيل العزل الأمني. لا تنشر secrets أو document contents أو payment proofs في logs أو قنوات التواصل. احفظ timestamps وcommit وrequest correlation identifiers غير الحساسة، وأشرك مالك الأمن عند أي احتمال IDOR أو تسريب.

أبلغ العملاء فقط بالمعلومات المؤكدة، ولا تعد بموعد أو استرداد أو توفر قبل قرار Operations/Finance/Legal. أغلق الحادث بعد root-cause review وverification وقرار follow-up.

## 6. Database backup verification

يؤكد Infra Owner نجاح آخر backup ومكان تخزينه وتشفيره وretention policy، ثم ينفذ restore drill في بيئة معزولة لا تؤثر على Production. قِس زمن الاستعادة وفقد البيانات المتوقع، وتحقق من سلامة العلاقات وhistorical order prices وprivate documents access. لا تعتبر وجود ملف backup دليلًا على قابلية الاستعادة دون drill موثق.

Required evidence:

- backup schedule and retention;
- encryption/storage ownership;
- latest successful backup timestamp;
- isolated restore start/end timestamps;
- integrity checks after restore;
- measured RPO and RTO;
- escalation owner when backup or restore fails.

## 7. Monitoring

راقب uptime، API 4xx/5xx، auth failures، DB connectivity، upload failures، document/payment review failures، queue/provider latency، storage capacity، وresource saturation. يجب أن تصل alerts إلى مالك مناوب مع severity وrunbook واضحين. لا تسجل كلمات المرور أو tokens أو passport numbers أو document/payment contents.

Current evidence: the connected Vercel project exposes Preview runtime logs, and the seven-day runtime error query returned no runtime errors at the time of this readiness review. This proves log/error visibility on the frontend hosting layer only; it does **not** prove backend/database/payment/supplier alert routing or on-call escalation.

## 8. Customer isolation

NASAEM في نطاق الإطلاق الحالي هو تطبيق لوكالة واحدة مع حسابات Customer متعددة، وليس SaaS متعدد الوكالات. حد العزل المطلوب هو Customer ownership.

`backend/tests/customerIsolation.test.js` creates two independently authenticated customers against disposable PostgreSQL in CI and verifies list/direct-ID order isolation and notification mutation isolation. Customer-facing services derive identity from the authenticated customer session and include `customerId` in ownership queries.

Required invariant for covered automated paths:

> **CROSS-CUSTOMER ACCESS = 0**

A separate Prisma `Tenant`/`Organization` model is not a launch requirement unless the product scope changes to hosting multiple independent agencies/companies in one deployment/database.

## 9. Preview / Staging boundary

A real Vercel Preview deployment for PR #42 is available and reaches `READY`; Preview responses are `noindex`, and Vercel runtime logs are accessible.

However, the repository previously allowed Preview browser code to target the Railway Production API. This readiness work corrected that unsafe boundary in both `web/src/lib/api-url.ts` and legacy `web/public/assets/api.js`: when the configured backend is the Production Railway host, any unapproved Preview/branch hostname now fails closed to same-origin `/api` rather than sending browser mutations to Production.

The deployed Preview copy of `/assets/api.js` was checked and contains this fail-closed guard.

**Important:** Vercel Preview is therefore suitable for safe frontend/read-only verification, but it is **not yet a complete writable Staging environment** because a dedicated non-Production backend/database and non-Production external-service credentials have not been supplied. Do not create Customer A/B, uploads, payment proofs, orders, or other write-test data in Preview until that backend/database boundary exists.

## 10. Payment and suppliers

The current payment implementation is a manual record/review workflow. Do not claim payment-provider sandbox verification unless an actual gateway is selected and non-Production credentials/callbacks exist. Finance/Owner must either approve the manual workflow for launch or select a provider and complete sandbox verification.

External supplier verification is required only for integrations that are actually enabled. Where no supplier API contract exists, preserve explicit manual quote/review language rather than fabricating provider availability.

## 11. Current gates

| Gate | Current status | Remaining evidence |
|---|---|---|
| Repository customer A/B isolation | PASS for covered CI paths | Live full-resource matrix after writable Staging exists |
| Frontend Preview | READY / SAFE FOR READ-ONLY QA | Dedicated non-Production backend required for write QA |
| Preview→Production mutation protection | IMPLEMENTED | Final CI/build for latest security commit |
| Backup/restore | INFRASTRUCTURE INPUT REQUIRED | Isolated drill + RPO/RTO |
| Backend monitoring/alerts | INFRASTRUCTURE INPUT REQUIRED | Alert destinations, thresholds, incident owner |
| Rollback | NON-PRODUCTION BACKEND REQUIRED | Execute drill against disposable environment |
| Payment | OWNER/EXTERNAL DECISION REQUIRED | Manual-flow approval or selected provider sandbox evidence |
| Suppliers | OWNER/EXTERNAL DECISION REQUIRED | Manual-flow approval or enabled provider sandbox evidence |
| Legal/commercial | OWNER/LEGAL ACTION REQUIRED | Approved policies, prices, fees, company and supplier/payment terms |

## 12. Safety status

**MERGE: NOT PERFORMED**  
**PRODUCTION DEPLOYMENT: NOT PERFORMED**  
**PRODUCTION MIGRATIONS: NOT PERFORMED**  
**PRODUCTION CONFIGURATION: NOT CHANGED**  
**PRODUCTION CREDENTIALS: NOT USED**

Current classification:

> **APPLICATION: READY FOR CONTROLLED FRONTEND PREVIEW / OWNER REVIEW**
>
> **WRITABLE STAGING: NOT READY — NON-PRODUCTION BACKEND/DATABASE REQUIRED**
>
> **PRODUCTION: NOT READY — EXTERNAL VERIFICATION REQUIRED**
