# Admin usability audit — can staff actually do the job?

Date: 2026-10-11 · Branch `claude/busy-hamilton-1ccxm1` · Browser tests only (Chromium via Playwright). Nothing here was run on an Android device.

There are two staff surfaces:

- **Back-office** (`backend/public`, served by the API: `/admin-dashboard.html`) — the complete request workflow.
- **Next.js admin** (`web/src/app/admin`) — dashboards, case workspace, payment review, delivery page.

## Verified by a browser test, for every service

Evidence: `web/e2e/service-journeys.spec.ts` (7 journeys: flights, ferries, hotels, Umrah, family visit, Egypt clearance, a visa type created in the back-office during the test). Each journey drives the back-office UI, not the API.

| Staff action | Where | Evidence in the journey |
|---|---|---|
| Find the request | Back-office → «طلبات العملاء» → search by the traveler's name (one exact row) | `openStaffRequest` |
| See every traveler and each traveler's documents | Request detail → «المسافرون», «مستندات العميل» (traveler column) | count of document rows = uploaded documents |
| Accept a document | «قبول» per document | loop until none pending |
| Reject a document with a reason; customer re-uploads for the same traveler | reason field + «رفض» | dynamic-visa journey |
| Set the price | «السعر» form | every journey |
| Reject a receipt with a reason; customer sees it and re-uploads | «الدفع» → «رفض الإيصال» | flights journey |
| Accept the payment | «الدفع» → «تأكيد استلام الدفع» | every journey |
| Start execution (only after payment) | «التنفيذ» → «تسجيل بدء التنفيذ» (form absent before payment) | every journey |
| Upload the final file | «الملفات النهائية» → «رفع وتسليم» | every journey; request closes «مكتمل» |
| Open the right request from a notification | 🔔 → receipt notification → `#/requests/<id>` | flights journey; also `mobile-app.spec.ts` («staff: opening the notification…») |
| Staff and customer see the same status | «ما يراه العميل» in «التنفيذ» = the app's progress label | `bothSay(...)` at payment accepted, in execution, completed |

## Found and fixed in this batch

1. **Next.js `/admin/payment-review` could not reject a customer-request receipt** — the «رفض» button appeared only for order payments. Fixed: it now calls `POST /api/contact-requests/:id/reject-payment` with the reason. Verified by `npm run typecheck` / `lint` only (no browser test for this page).
2. **No way to record the start of execution** anywhere. Added to the back-office request detail (browser-tested) and to the Next.js delivery panel `components/sections/operations-deliverable-panel.tsx` (typecheck/lint only).
3. **The receipt appeared as an ordinary document with «قبول/رفض» buttons** in the back-office. Accepting it there did not confirm the payment, which invited a wrong click. The receipt row now says «إيصال دفع — يُراجع من قسم «الدفع»» and has no document buttons (browser-tested).
4. **Operations center counted a confirmed request with a selected offer as «بانتظار العميل»** (`dashboard.service.js contactNextAction`). Fixed; paid requests now show «بدء التنفيذ», then «إصدار وتسليم».

## Still missing (not fixed here)

| Gap | Impact | Where to do it today |
|---|---|---|
| The Next.js case workspace (`/admin/cases`) has no price, payment accept/reject, start-execution or final-file actions | Staff who use only the Next.js admin must switch screens | Back-office request detail (all actions), or `/admin/payment-review` and `/admin/delivery?requestId=` |
| Readiness queues (`computeReadiness`) have no «قيد التنفيذ» bucket; a paid request shows «جاهز للمعالجة» before and after execution starts | Queue view does not separate started from not-started work | Request detail «التنفيذ»; operations center «بدء التنفيذ» |
| Egypt clearance: the post-approval travel-plan step is not part of the journey test | Covered only by its own backend tests | `backend/tests/egyptClearanceTravelRules.test.js`, `egyptClearanceIntake.test.js` |
| No browser test for the Next.js admin pages touched above | Regressions there are caught only by typecheck/lint | — |
| Execution start cannot be undone from the UI | A mistaken click needs a manual DB fix | — |
