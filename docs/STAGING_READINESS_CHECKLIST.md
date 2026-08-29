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
| Customer A/B automated isolation | PASS IN PREVIOUS CI FOR COVERED PATHS | `backend/tests/customerIsolation.test.js` creates independent Customer A/B accounts against disposable PostgreSQL |
| Organization A/B automated isolation | PASS — full inventory closed | Module inventory (2026-08-29) found Payments/Documents/Finance/Dashboard/ActivityLog were unscoped despite depending on scoped `Order`/`Customer`/`ContactRequest`/`User`; all fixed (415/415 backend tests green, A/B regression tests added for each). `Notification` reviewed and confirmed already safe by design — see "Organization scoping inventory" |
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

تم توسيع اتجاه المنتج ليستوعب وكالات مستقلة مستقبلًا. أُضيف حد `Organization` صريح إلى هوية الموظف والعميل والطلب وطلب الخدمة، مع backfill آمن يجعل كل البيانات الحالية تابعة لنسائم الحرمين. تغطي الحواجز الحالية أسطح العملاء والطلبات وجميع مسارات الإدارة المتفرعة من طلب الخدمة، لكنها **ليست إعلانًا باكتمال SaaS متعدد المؤسسات**؛ ما زال يلزم جرد بقية الوحدات العامة والمالية والمحتوى وتحديد ما هو مشترك وما هو خاص بالمؤسسة.

## Organization scoping inventory (2026-08-29)

جرد فعلي لكل وحدة backend (`grep` على `organizationId` عبر `prisma/schema.prisma` و`src/modules/`)، تنفيذًا لبند A4 في `docs/COMPLETION_PLAN.md`:

**مُعزول فعليًا (له عمود `organizationId` + مُطبَّق في الاستعلامات):**
`Branch`, `User`, `Customer`, `Order`, `ContactRequest`. مغطاة بـ `organizationIsolation.test.js` (list/read/mutate/create عبر مؤسسة أخرى تُرفض، وقيد قاعدة بيانات يمنع طلبًا بمؤسسة تخالف مؤسسة عميله).

**فجوة كانت حقيقية — أُصلحت في هذه الدورة (Payments/Documents/Finance):**
`Payment` و`Document` كلاهما يتبعان `Order` (المُعزول)، لكن `listPayments`/`listDocuments` كانا لا يستقبلان `organizationId` أصلًا ولا يُصفّيان به (لا مباشرة ولا عبر `order.organizationId`)، ونفس الغياب كان في `finance.service.js` (`fetchOrdersInRange`/`getFinancialReport`). **تم إصلاحه الآن**: `listPayments`, `getPaymentById`, `confirmPayment`, `rejectPayment`, `createPayment` (منع إنشاء دفعة على طلب مؤسسة أخرى)، `listDocuments`, `getDocumentById`, `createDocument`, `deleteDocument`, و`getFinancialReport`/`fetchOrdersInRange` تصفّي جميعها الآن عبر `organizationId` (مباشرة أو عبر `order: { organizationId }`)، بنفس نمط `findFirst({ where: { id, organizationId } })` المستخدم أصلًا في `orders.service.js`. اختبار جديد في `organizationIsolation.test.js` ("payments, documents and the finance report are scoped to the caller's organization") يثبت: دفعة/مستند مؤسسة أخرى يرجعان 404 عند القراءة/التأكيد/الرفض/الحذف، إنشاء دفعة على طلب مؤسسة أخرى يرجع 404، وتقرير مالي لمؤسسة جديدة يُرجع طلبها الوحيد فقط (وليس كل الطلبات في قاعدة البيانات — دليل أن التصفية فعلية لا مصادفة). **408/408 اختبار خلفي ناجح** (شمل هذا التعديل) على قاعدة PostgreSQL معزولة محليًا بعد `prisma migrate deploy` + seed.

**أُصلح أيضًا:** `dashboard.service.js` (`getDashboardStats`, `getOperationsCenter`, `getDashboardSummary`) — نفس نوع الفجوة (عدّادات/تجميعات عبر `Customer`/`Order`/`Payment`/`Document`/`ContactRequest` بلا تصفية مؤسسة عبر 6+ استعلامات منفصلة). أُضيفت تصفية `organizationId` (مباشرة أو عبر `order: { organizationId }`) لكل الاستعلامات، مع استثناء متعمّد لـ `Offer`/`Service` (كتالوجات مشتركة بلا عمود `organizationId` أصلًا). اختبار A/B جديد يثبت أن مؤسسة جديدة تُرجع عدداتها الخاصة فقط (وليس كل بيانات قاعدة الاختبار المشتركة) — 414/414 اختبار أخضر.

**أُصلح أيضًا:** `ActivityLog` — سجل النشاط (`GET /api/activity-logs`، SUPER_ADMIN/ADMIN) لم يكن يُصفّي بالمؤسسة إطلاقًا رغم أن أغلب مُدخلاته تخص إجراءات موظفين تابعين لمؤسسة معيّنة، وبعض إدخالاته تحمل بيانات (`oldValue`/`newValue`) قد تتضمن أسعارًا أو أسماء. أُضيف عمود `organizationId` فعليًا عبر migration جديدة (`20260829200000_add_activitylog_organization`، بنفس نمط migration حدود المؤسسات الأصلية)، ودالة `logActivity()` أصبحت تُحلّل المؤسسة تلقائيًا دون الحاجة لتعديل أكثر من 50 موضع استدعاء: (1) `organizationId` صريح إن وُجد، (2) `req.user`/`req.customer`/`req.organizationId` من طلب المصادقة، (3) بحث عن مؤسسة `userId` في قاعدة البيانات (يغطي حالات مثل `LOGIN` حيث `req.user` غير مُعرَّف بعد على نفس الطلب)، (4) مؤسسة `ContactRequest` نفسه عند غياب كل ما سبق (يغطي إجراءات بوابة تتبع العميل التي لا تحمل `req` ولا `userId` إطلاقًا). اختبار A/B جديد يثبت أن كلا مسارَي الاستدلال (عبر `userId` وعبر `ContactRequest`) يُنتجان المؤسسة الصحيحة ولا يتسرّبان لمؤسسة أخرى — 415/415 اختبار أخضر، وتأكدت جداول `flight_*` الخام بقيت سليمة بعد الـ migration.

**رُوجع ووُجد آمنًا مسبقًا بدون تعديل:** `Notification` — كل مسارات القراءة/التعديل (`listNotifications`, `markNotificationRead` للموظفين؛ نظيرتاهما للعملاء في `customer-portal`) مُقيَّدة بالفعل بملكية شخصية صارمة (`userId`/`customerId` الخاص بالمُستدعي نفسه فقط، عبر `where: { userId }` أو `findFirst({ id, customerId })`) — لا يوجد أي قائمة إشعارات عامة عبر كل الموظفين. هذا النمط آمن من تسرّب عبر المؤسسات بحكم تصميمه (نفس منطق حماية "طلبات العميل الخاصة به فقط" الذي كان قائمًا قبل إضافة عزل المؤسسات أصلًا)، فلا حاجة لعمود `organizationId` لإغلاق هذه الفجوة تحديدًا.

**مشترك/عام حسب التصميم الحالي (بلا `organizationId`، ولا يوجد فيها بيانات عميل حساسة):**
`Service`, `VisaType`, `VisaRequirement`, `FerryOperator`, `FerrySchedule`, `Airline`, `Airport`, `FeatureFlag`, `HomepageSection`, `Setting`, `SiteAsset`, `Coupon`, `Supplier`, `UmrahGroup`. هذه كتالوجات/إعدادات تشغيلية — قرار بقائها مشتركة بين كل المؤسسات (كتالوج موحّد لكل الوكالات) أو أن تصبح خاصة بكل مؤسسة هو **قرار منتج**، وليس خطأ تقني، ويجب حسمه صراحة قبل أي إعلان عن دعم SaaS متعدد المؤسسات (انظر خيارات ذلك في `COMPLETION_PLAN.md` المسار A4).

بهذا، **جرد وإغلاق عزل المؤسسات لكل الوحدات ذات البيانات الحساسة اكتمل بالكامل**، بما فيها ActivityLog/Notification.

## Automated A/B evidence

`backend/tests/customerIsolation.test.js` يغطي:

- A يرى طلب A ولا يرى طلب B في القائمة؛
- B يرى طلب B ولا يرى طلب A؛
- direct-ID order access للعميل الآخر يرجع 404 في الاتجاهين؛
- كل عميل يعدل إشعاره فقط؛
- cross-customer notification mutation يرجع 404.

Required invariant for covered paths:

> **CROSS-CUSTOMER ACCESS = 0**

ويضيف `backend/tests/organizationIsolation.test.js` invariant مستقلًا للمسارات المؤسسية المغطاة:

> **CROSS-ORGANIZATION ACCESS = 0**

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
