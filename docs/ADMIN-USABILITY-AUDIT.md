# Admin usability audit — can staff actually do the job?

Updated: 2026-10-12 (workflow repair) · Branch `claude/busy-hamilton-1ccxm1` · Browser tests in Chromium via Playwright. Nothing here was run on an Android device.

Staff surfaces:

- **Back-office** (`backend/public`, `/admin-dashboard.html`) — complete request workflow.
- **Next.js admin** (`web/src/app/admin`) — `/admin/cases` now carries the complete request workflow in its «سير العمل» tab; `/admin/payment-review` and `/admin/delivery?requestId=` reuse the same endpoints and panel.

Both show only the actions the server lists in `allowedActions` for the viewer's role and the request's stored state (`docs/WORKFLOW-POLICY.md`). A stale click is refused by the server with an Arabic reason.

## Verified by browser tests

| Staff action | Back-office (`service-journeys.spec.ts`, 7 services) | Next.js admin (`admin-workflow.spec.ts`) |
|---|---|---|
| Find the request | search by traveler name → one row | `/admin/cases?requestId=` (also linked from payment review) |
| See travelers and each traveler's documents | detail tables | «المسافرون», «المستندات» tabs |
| Accept / reject a document with a reason | «قبول» / reason + «رفض»; customer re-uploads (dynamic-visa journey) | «المستندات» → «قبول» |
| Why execution cannot start yet | «لا يمكن بدء التنفيذ بعد» list (unit/API-tested) | «سير العمل» blockers name the missing traveler and pending review (browser) |
| Set the price | «السعر» form | «سير العمل» price form (rendered when allowed; exercised through the API in this spec) |
| Reject a receipt with a reason, accept the new one | flights journey | `/admin/payment-review` (browser) |
| Start execution | every journey | «سير العمل» and `/admin/delivery` |
| Per-traveler final files: publish now, or save a draft and publish later | every journey (traveler 1 published, traveler 2 draft → publish) | «سير العمل» (both travelers), `/admin/delivery` (single traveler) |
| Completion only when every traveler is covered | request stays open after the first file; closes after the second | same |
| Egypt: customer travel plan, then staff complete | Egypt journey (app form + back-office close) | — |
| Closed request is read-only | no review/payment/execution/file/close controls; reopen for admins only | «الطلب مغلق وللقراءة فقط», only «إعادة فتح» |
| Open the right request from a notification | flights journey (receipt notification) | — |
| Staff and customer see the same status | `bothSay(...)` at each stage | workflow label = customer label |

## Found and fixed in this repair

1. Closed requests accepted workflow actions (approve a pending price, upload, review, execution, files). Now refused server-side and hidden everywhere.
2. Execution could start with missing/rejected/pending documents. Now gated; the reasons are shown to staff.
3. One file completed a group request; files were announced the moment they were uploaded. Now per-traveler coverage, drafts, explicit publishing.
4. `/admin/cases` lacked price, payment, execution, delivery and closing actions → «سير العمل» tab.
5. Queues had no execution states → «مدفوعة، بانتظار التنفيذ» (AWAITING_EXECUTION), «قيد التنفيذ» (IN_EXECUTION), «الملفات النهائية منشورة» (RESULTS_READY).
6. `/admin/payment-review` listed only the 50 least-recently-updated open requests, so a fresh receipt could be missing on a busy day. Every payment under review is now listed (`operationsCenter.test.js` reproduces the old miss).
7. An accidental execution start needed a database edit → audited correction (admins, reason; before any published file).
8. «نشر للعميل الآن» in `/admin/cases` stayed unchecked after execution started (React default value) — found by the browser test, fixed.
9. A closed request could still be handed to an external provider (provider submission). Now refused with the same Arabic reason.

## Still missing / limits

| Gap | Impact |
|---|---|
| The Next.js price form in «سير العمل» and its close/reopen forms are not clicked by a browser test (the back-office equivalents are) | caught by typecheck/lint and by the back-office browser tests of the same endpoints |
| No undo for a published file | a wrong file needs a new published file; the old one stays visible to the customer |
| No real-device test of any of this | see `docs/SERVICE-ACCEPTANCE.md` |
