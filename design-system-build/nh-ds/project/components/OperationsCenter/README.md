# OperationsCenter

The Operations Center (مركز العمليات) for the first release: **Umrah and Egypt security clearance only**. One screen that answers "what needs me now, and who owns it?". **All data in the preview is demonstration data.**

## Built on the real workflow (unchanged)
Everything maps to `GET /dashboard/operations` (`backend/src/modules/dashboard/dashboard.service.js`) and the current `operations-center.tsx`:
- **Queue tiles** = `queues`: newRequests, waitingPaymentReview, unassignedOrders, waitingDocuments, waitingCustomer, readyToDeliver, each with the Umrah / Egypt split.
- **Priority** = the existing `priority()` rule. Only its *presentation* changes (see below).
- **Next action** = `nextAction.label` (مراجعة الدفع، إصدار وتسليم، مراجعة المستندات، متابعة الدفع، إضافة سعر، معالجة الطلب، بانتظار العميل).
- **تعيين لي** = the existing assign-to-me action, offered only on unassigned items.
- **Payment approval / rejection** stays on `/admin/payment-review` (confirm, or reject with a reason that reaches the customer).

## v3 refinements
1. **Red means overdue, nothing else.** Visual mapping of `priority()`: stalled (ageHours ≥ 24) → red "متأخر" with its age, plus a faint row tint; urgent (CONFIRM_PAYMENT, DELIVER) → amber "أولوية عالية"; customer → neutral "لدى العميل"; normal → neutral "عادية". The focus strip, sidebar counts, notification dot and payment mismatch are no longer red. The only other red is per-employee overdue counts, which are also genuinely overdue.
2. **Payments are read-only here.** The panel is a *summary* (count waiting, age of the oldest receipt, how many need checking, a total, the four latest receipts with match/mismatch). Every payment path leads to "فتح صفحة مراجعة الدفعات"; approve and reject exist only on that page.
3. **No horizontal scrolling.** The table has 6 fixed-width columns (العميل والطلب، الأولوية، الحالة، الدفع، الموظف المسؤول، الإجراء التالي) that fit 1104px, and cells wrap instead of scrolling. Phone numbers moved into the case; amounts sit inside the payment cell; age sits under priority.
4. **Owner and next step are explicit.** A dedicated "الموظف المسؤول" column with an avatar and name; "أنت" marks the signed-in user, and "غير مسند" (amber) comes with an inline "تعيين لي". The next-action cell gives the verb as a button plus one line saying where or what ("يُعتمد في صفحة مراجعة الدفعات", "إرسال ملف الموافقة للعميل"). When nothing is needed, it says so ("بانتظار رد العميل · لا إجراء مطلوب الآن").
5. **Arabic readability and density.** 15px bold names, 14px cell text on a 24px line, 16px cell padding, Western digits throughout (no mixed ٣/3), no abbreviations like "س" for hours, fewer filter chips (one "الفلاتر" button), and more space between sections.

## Status: APPROVED design baseline (31 Oct 2026)
The v3 visual direction is the approved baseline for implementation. Later changes are refinements on top of it.

## Implementation requirements (recorded at approval)
**R1. Egypt clearance: show and sort by travel date.**
- Show the travel / entry date (`intakeData.egyptTravel.entryDate`) and entry mode (منفذ جوي / منفذ بري) on every Egypt clearance row, with days remaining ("بعد 9 أيام").
- Default sort for Egypt clearance is nearest travel date first. Requests with no travel plan yet sort after dated ones, labelled "لم يُحدد السفر", and keep their current order among themselves.
- When the service filter is "كل الخدمات", Umrah rows keep today's order. The travel-date sort applies within Egypt rows (or when the Egypt filter is on).

**R2. Inactive is not the same as overdue.**
- **بلا نشاط 24 ساعة** (inactive): `ageHours ≥ 24` since the last update, the current `priority() = stalled` rule. A prompt to look, not a breach. Shown in **amber**, with a clock icon and the age.
- **متأخر عن الموعد** (missed an operational deadline): a real deadline has passed: case SLA `OVERDUE` / `dueAt` in the past, a case task past its `dueAt`, or an Egypt entry date less than 72 hours away with no circular issued. Shown in **red**, with the deadline that was missed.
- Red is reserved for the second group only. A case can be both; it then shows red with the inactivity as a secondary line.
- This changes the v3 preview, where stalled (inactive) items are red. Implement R2, not the preview, for this rule.

## Permission note found during Case Workspace design
- `PATCH /contact-requests/:id/assign` is limited to SUPER_ADMIN and ADMIN; `PATCH /orders/:id/assign` also allows EMPLOYEE. So "تعيين لي" is valid for an employee only on **order** rows. For contact-request rows (all Egypt clearance cases and Umrah requests made through the request form), an employee should see "غير مسند" with no self-assign. The v3 preview's "تعيين لي" on EG-DEMO rows is therefore an admin-view example only.

## Proposed data needs (not implemented)
The receipt/invoice match, Umrah departure capacity, per-employee overdue counts and the "أنت" marker (needs the current user id beside `assignedUserId`, already fetched by the page) are design intent; the operations endpoint does not return the first three today.

## Layout
1440px desktop: 272px rail, 32px gutters, 1104px content, 28px between sections. Order: focus strip, queue tiles, full-width table, then payment summary / service panels / team workload.
