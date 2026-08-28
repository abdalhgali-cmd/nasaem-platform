# NASAEM — Staging Readiness Checklist

> هذه القائمة تفرق بين **Vercel frontend Preview** المتاح حاليًا وبين **writable Staging** الذي يحتاج Backend/Database غير إنتاجيين. لا تُستخدم Production بدل Staging ولا تُنفذ write tests على Production.

| Area | Current status | Evidence / blocker |
|---|---|---|
| Vercel Preview deployment | PASS | PR #42 Preview reaches `READY`; Preview is `target: null` and not Production |
| Preview indexing protection | PASS | Preview responses carry `x-robots-tag: noindex` |
| Preview runtime visibility | PASS | Vercel runtime logs available; seven-day runtime-error query returned no errors during review |
| Preview → Production write isolation | IMPLEMENTED | `web/src/lib/api-url.ts` and `web/public/assets/api.js` fail closed to same-origin `/api` on unapproved Preview/branch hostnames when the configured API is the Production Railway host |
| Dedicated non-Production Backend | BLOCKED | No authorized disposable backend supplied |
| Dedicated non-Production Database | BLOCKED | No disposable PostgreSQL Staging database supplied |
| Homepage/read-only frontend QA | AVAILABLE ON PREVIEW | Preview can be used for safe read-only/front-end checks |
| Customer A/B automated isolation | PASS IN CI FOR COVERED PATHS | `backend/tests/customerIsolation.test.js` creates independent Customer A/B accounts against disposable PostgreSQL |
| Customer A/B live isolation | BLOCKED UNTIL WRITABLE STAGING | Must not create customers against Production backend |
| RBAC live matrix | BLOCKED UNTIL WRITABLE STAGING | Repository tests exist; live direct-API/UI matrix still needed |
| Documents/files live isolation | BLOCKED UNTIL WRITABLE STAGING | Repository ownership/upload tests exist; private storage/download matrix remains |
| Payment live workflow | OWNER/EXTERNAL DECISION REQUIRED | Current implementation is manual review; provider sandbox needed only if a gateway is selected |
| Supplier live integration | OWNER/EXTERNAL DECISION REQUIRED | Verify enabled provider only; retain manual flow if no contract/integration exists |
| Backup/restore | INFRASTRUCTURE INPUT REQUIRED | Isolated backend/database restore drill + measured RPO/RTO required |
| Monitoring/alerting | PARTIAL | Vercel logs/errors visible; backend/DB/provider alert destinations, thresholds and on-call ownership remain |
| Rollback | INFRASTRUCTURE INPUT REQUIRED | Runbook defined; disposable full-stack environment required for drill |
| Legal/commercial | OWNER/LEGAL ACTION REQUIRED | Approved policies, prices, fees, provider/supplier terms and company data remain |

## Customer isolation model

NASAEM في نطاق الإطلاق الحالي هو تطبيق لوكالة واحدة يخدم حسابات Customer متعددة، وليس SaaS متعدد الوكالات. حد العزل الأمني المطلوب هو **Customer A مقابل Customer B** عبر هوية العميل المصادق عليها و`customerId` على الموارد المملوكة للعميل.

لا يُطلب إنشاء Prisma `Tenant` أو `Organization` لإطلاق النموذج الحالي. يصبح organization-level multi-tenancy مشروعًا معماريًا منفصلًا فقط إذا تغير نطاق المنتج ليستضيف وكالات/شركات مستقلة متعددة داخل نفس النشر وقاعدة البيانات.

## Automated A/B evidence

`backend/tests/customerIsolation.test.js` يغطي:

- A يرى طلب A ولا يرى طلب B في القائمة؛
- B يرى طلب B ولا يرى طلب A؛
- direct-ID order access للعميل الآخر يرجع 404 في الاتجاهين؛
- كل عميل يعدل إشعاره فقط؛
- cross-customer notification mutation يرجع 404.

Required invariant for covered paths:

> **CROSS-CUSTOMER ACCESS = 0**

GitHub Actions يشغل الاختبارات على PostgreSQL disposable بعد migrations وseed، وقد نجح run الذي أدخل اختبار A/B.

## Preview safety boundary

كان `web/public/assets/api.js` يربط Railway Production API صراحة حتى على Preview. تم إصلاح ذلك، وكذلك إضافة guard مركزي في `web/src/lib/api-url.ts`.

السلوك المطلوب الآن:

- approved Production hostname + Production API URL → configured Production API allowed;
- PR/branch Preview + Production API URL → browser API base becomes same-origin `/api`, فلا تصل mutations إلى Railway Production;
- Preview يبقى مناسبًا للـfrontend/read-only QA فقط حتى يتوفر Backend/DB غير إنتاجيين.

تم التحقق من النسخة المنشورة لـ`/assets/api.js` على Vercel Preview وأن guard موجود فعليًا.

## Controlled live A/B procedure once writable Staging exists

1. Create synthetic Customer A and Customer B with separate accounts and no real PII/documents.
2. Record generated IDs for orders, requests, offers, invoices, payments, documents, notifications and deliverables.
3. As A, attempt B list/direct-ID/search/filter/export/upload/download/mutation paths; repeat B→A.
4. Alter path IDs, query parameters and request bodies; verify `401/403/404/null` according to endpoint contract.
5. Execute staff RBAC matrix separately and verify audit events.
6. Any unauthorized cross-customer read or mutation blocks release.

## Exit criteria

Production remains blocked until all mandatory evidence is present:

- writable non-Production Backend + Database;
- live Customer A/B full-resource verification;
- live RBAC/document workflow verification;
- payment/supplier decision and sandbox evidence where applicable;
- backup/restore drill with measured RPO/RTO;
- backend/database monitoring and alert ownership;
- rollback drill;
- legal/commercial/owner approvals.

Current classification:

> **FRONTEND PREVIEW: READY FOR CONTROLLED READ-ONLY QA**
>
> **WRITABLE STAGING: NOT READY — NON-PRODUCTION BACKEND/DATABASE REQUIRED**
>
> **PRODUCTION: NOT READY — EXTERNAL VERIFICATION REQUIRED**
