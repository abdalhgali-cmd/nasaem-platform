# CaseWorkspace

The case workspace (شاشة إدارة الطلب الواحد): one screen per case that tells an employee what this case is, where it stands, what they must do next, and what they are not allowed to do. Two variants: **Egypt security clearance** (EG-DEMO-0431) and **Umrah** (UM-DEMO-1192, card CaseWorkspaceUmrah). **All data is synthetic demonstration data.**

## Reading order (top to bottom)
1. **Case header**: customer, reference, service, status; five facts (travel/entry date with days left, entry or travel method, approval or travelers, payment, assigned employee with SLA).
2. **الإجراء التالي المطلوب منك**: one sentence, the reason, the deadline, one primary button, and what comes after. When nothing is required of the employee it says so.
3. **المرحلة الحالية**: the journey as steps. **Egypt shows two separate phases**: (1) الموافقة الأمنية, from intake to approval delivered, and (2) السفر والتعميم: travel data, booking, ticket review, circular request, circular issued, circular delivered, with the 72-hour rule stated in plain words. Approval issuance is never presented as "ready to travel".
4. **المسافرون والمستندات**: per traveler: passport number, nationality, date of birth, passport expiry, then each document with its state. Accept / reject-with-reason only on documents pending review. Case-intelligence warnings (expiry, OCR mismatch, duplicates) show as amber advisories that never reject automatically.
5. **الملفات المسلّمة للعميل**: deliverables with download; future deliverables (Egypt circular, Umrah visas) appear disabled with the reason.
6. **سجل الحالة**: the audit trail (ACTION_LABEL wording) with a tab for internal notes.
Side column: customer, travel (Egypt: entry mode, date, booking, last safe circular date) or group (Umrah), readiness checks (same three as today), payment (read-only), assignment (read-only), open tasks, provider submission.

## Actions shown = actions the EMPLOYEE role is allowed today
From `contact-requests.routes.js`:
| Action on screen | Route | Roles |
|---|---|---|
| قبول / رفض مع سبب (document) | PATCH /:id/documents/:documentId/status | SUPER_ADMIN, ADMIN, EMPLOYEE (+STAFF_REVIEW flag) |
| تنزيل / فتح (customer documents, deliverables) | GET …/file | SUPER_ADMIN, ADMIN, EMPLOYEE, ACCOUNTANT |
| رفع ملف للعميل (approval, circular, visas) | POST /:id/deliverables | SUPER_ADMIN, ADMIN, EMPLOYEE (+DOCUMENTS flag) |
| ملاحظة داخلية | POST /:id/notes | SUPER_ADMIN, ADMIN, EMPLOYEE |
| مهمة / إنهاء مهمة | POST /:id/tasks, PATCH …/complete | SUPER_ADMIN, ADMIN, EMPLOYEE |
| إرسال إلى الجهة | POST /:id/provider-submissions | SUPER_ADMIN, ADMIN, EMPLOYEE |

**Shown read-only, with the reason:** payment confirmation (POST /:id/confirm-payment: SUPER_ADMIN, ADMIN, ACCOUNTANT, done on the Payment Review page) and assignment (PATCH /:id/assign: SUPER_ADMIN, ADMIN). An admin viewing the same screen would additionally get "تغيير المسؤول". The header chip "تعرض بصلاحية: موظف عمليات" makes the role explicit.
Pricing (invoice / offer) is not shown on this employee view; nothing about prices is changed.

## Data the design uses that is not on the case payload today
- Egypt travel plan on the staff side: `intakeData.egyptTravel` (entryMode, entryDate, bookingStatus, circularStatus) exists for the customer portal; the staff case payload must include it.
- "Last safe circular date" = entryDate − 72h (derived; matches the portal's rule).
- Umrah group, departure and return dates on the case (from umrah-groups).
- Two-phase Egypt journey needs the circular steps recorded (e.g. as a provider submission and a deliverable labelled as the circular).
These are design intent; no API or logic was changed.

## Layout
1440px: 272px rail, 32px gutters; main column + 352px side column, 24px gaps. Body text 14px/24px, names 16px, facts 15.5px, section titles 16px.
