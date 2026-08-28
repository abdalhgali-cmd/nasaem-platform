# NASAEM — Production Readiness Checklist

> لا تعني هذه الوثيقة أن Production جاهزة. لا تُعتبر `UNKNOWN` مساوية لـ`PASS`، ولا يُغلق أي gate دون evidence قابل للتدقيق.

| Gate | Expected | Actual | Status | Evidence | Owner |
|---|---|---|---|---|---|
| Commercial data | Visa/Umrah/services/prices/contact/approved content حقيقية | لم تُقدم بيانات المالك داخل المهمة | OWNER INPUT REQUIRED | لا يوجد evidence خارجي | Business Owner |
| Legal | النصوص الرسمية للخصوصية والشروط والإلغاء والاسترداد والدفع وإشعار الوثائق | صفحات تقنية placeholder فقط | LEGAL INPUT REQUIRED | Legal approval غير متوفر | Legal Owner |
| Infrastructure | Railway/Vercel/API/CORS/health/replicas/limits موثقة | غير قابلة للتحقق بالكامل من repository | INFRASTRUCTURE INPUT REQUIRED | Dashboard/runtime evidence مطلوب | Infra Owner |
| Staging | بيئة disposable مصرح بها بقاعدة وsecrets غير إنتاجية | غير متوفرة | STAGING ACCESS REQUIRED | Live staging URL/evidence مطلوب | Infra + QA |
| Customer isolation | Customer A لا يصل إلى Customer B والعكس | server-side `customerId` ownership + A/B integration coverage موجودة | PASS IN BACKEND CI FOR COVERED PATHS / LIVE STAGING REQUIRED | `customerIsolation.test.js` + customer portal ownership queries | Security + QA |
| Backup | schedule/encryption/retention/success alerts | غير مثبت | INFRASTRUCTURE INPUT REQUIRED | Backup evidence مطلوب | Infra Owner |
| Restore | isolated restore drill مع RPO/RTO وrollback | لم يُنفذ | INFRASTRUCTURE INPUT REQUIRED | Restore evidence مطلوب | Infra Owner |
| Monitoring | uptime/API/DB/auth/upload/payment/storage/resource alerts | غير مثبت | INFRASTRUCTURE INPUT REQUIRED | Monitoring/alert evidence مطلوب | Infra Owner |
| Security | auth/RBAC/IDOR/uploads/downloads/errors review | repository checks وCI موجودة؛ live staging matrix غير منفذة | REPOSITORY/CI PASS FOR COVERED CONTROLS / STAGING REQUIRED | PR #42 + CI | Security |
| Payment | manual-only decision أو provider معتمد مع reconciliation/refunds/webhooks | manual payment workflow موجود؛ provider gateway غير مثبت | EXTERNAL/OWNER DECISION REQUIRED | Payment code/tests | Finance |
| Supplier | providers وavailability contract موثقة | supplier entities/flows موجودة لكن live external integration evidence غير مكتمل | SUPPLIER INPUT REQUIRED | Provider evidence مطلوب | Operations |
| Mobile | visual QA للرحلات الرئيسية وRTL | Playwright coverage موجود؛ visual staging غير منفذ | STAGING VERIFICATION REQUIRED | CI Playwright | QA |
| Accessibility | keyboard/focus/labels/aria/contrast/reduced motion audit | typecheck/build فقط؛ audit شامل غير منفذ | STAGING VERIFICATION REQUIRED | CI build evidence | QA |
| SEO | metadata/canonical/OG/robots/sitemap/structured data validated | implementation موجود؛ staging verification غير منفذ | STAGING VERIFICATION REQUIRED | SEO source review | Marketing |
| Analytics | privacy/event allowlist/retention/consent decision | لا provider ولا credentials | OWNER INPUT REQUIRED | لا analytics provider | Product + Privacy |
| Rollback | immutable artifact وprocedure وowner مجرب | runbook موجود؛ drill غير منفذ | INFRASTRUCTURE INPUT REQUIRED | Runbook + drill evidence | Infra Owner |
| Incident response | severity/escalation/customer comms/evidence retention | runbook موجود؛ operational drill غير منفذ | INFRASTRUCTURE INPUT REQUIRED | Runbook + drill evidence | Operations |

## Product architecture boundary

NASAEM في نطاق الإطلاق الحالي هو **منصة لوكالة نسائم الحرمين الواحدة مع حسابات عملاء متعددة**. حد العزل المطلوب للإطلاق هو Customer ownership، وليس Organization/Tenant ownership.

لذلك غياب Prisma `Tenant`/`Organization` model **ليس Production blocker في نطاق المنتج الحالي**. إضافة multi-organization tenancy مطلوبة فقط إذا أصبح المنتج مستقبلًا يستضيف وكالات أو شركات مستقلة متعددة في نفس النشر/قاعدة البيانات.

## Customer A/B evidence

تمت إضافة اختبار تكاملي مخصص `backend/tests/customerIsolation.test.js` يقوم بإنشاء حسابي Customer A وCustomer B منفصلين والتحقق من:

- list isolation للطلبات؛
- direct-ID order isolation في الاتجاهين؛
- own-resource access؛
- cross-customer notification mutation denial؛
- إعادة 404 عند محاولة الوصول إلى موارد العميل الآخر.

كما أن customer portal يعتمد `req.customer.id` من جلسة مصادق عليها ويضمّن `customerId` داخل ownership queries بدل الاعتماد على ID قادم من العميل فقط.

هذا يغلق فجوة **automated repository/CI evidence** للمسارات المغطاة، بينما يبقى اختبار live Staging الشامل إلزاميًا لبقية المسارات والملفات والتنزيلات والـUI.

## Release rule

لا تُعلن `READY FOR PUBLIC PRODUCTION` إلا بعد إثبات commercial data وlegal approval وinfrastructure verification وbackup/restore وmonitoring وstaging QA وpayment/supplier decisions.

الحالة الحالية:

> **APPLICATION: READY FOR CONTROLLED STAGING / OWNER REVIEW**
>
> **PRODUCTION: NOT READY — EXTERNAL VERIFICATION REQUIRED**

## Current production gates — 2026-08-28

| Production gate | Status | Evidence or blocker |
|---|---|---|
| Backend tests + Customer A/B covered paths | PASS in CI on implementation commit | PostgreSQL CI applies migrations/seeds then runs test suite including `customerIsolation.test.js` |
| Frontend typecheck + production build | PASS on implementation commit | GitHub Actions |
| Live Staging A/B isolation | STAGING ACCESS REQUIRED | Repeat synthetic direct-object matrix over all customer-owned paths/files in authorized Staging |
| Payment/provider verification | EXTERNAL VERIFICATION REQUIRED | Sandbox/provider credentials and callback environment not supplied |
| Supplier verification | EXTERNAL VERIFICATION REQUIRED | Supplier sandbox/contract evidence not supplied |
| Backup/restore and RPO/RTO | INFRASTRUCTURE INPUT REQUIRED | No isolated restore drill evidence supplied |
| Monitoring/alerting | INFRASTRUCTURE INPUT REQUIRED | No runtime alert evidence, destination, thresholds and operational ownership supplied |
| Rollback | INFRASTRUCTURE/STAGING INPUT REQUIRED | Procedure exists; non-production drill still required |
| Legal/commercial/owner approvals | OWNER ACTION REQUIRED | Approved policies, prices, supplier terms, company details and regulatory review remain outstanding |

No row above may be changed to PASS merely because code compiles or CI is green. Production remains blocked until every mandatory external gate has genuine evidence.
