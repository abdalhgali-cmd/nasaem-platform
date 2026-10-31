# Admin design system — Phase 4: Umrah Case Workspace

Real rendered interface (Playwright/Chromium, production build, local backend + disposable local PostgreSQL). «TEST-UMRAH …» requests were submitted through the public API into that local database only; «معتمر اختبار …» / «معتمر مساحة العمل …» rows are e2e test records. No demo data exists in the application.

| File | What it shows |
|---|---|
| `umrah-queue-1440.png` | `/admin/umrah` — Umrah requests: alerts, filters, sorted «الإجراء المطلوب أولًا» |
| `umrah-queue-390.png` | The same at 390 px (rows become cards) |
| `umrah-case-1440.png` | `/admin/cases?requestId=…&tab=umrah` — the «العمرة» tab |
| `umrah-case-390.png` | The same tab at 390 px |

Horizontal overflow at 390 px: 0 on both pages.

## Existing workflow only

- Stage, steps and their state: `progress` (backend `contact-request-progress/request-progress.js`). Staff next step and its rank: `umrahQueue` (`umrah/umrah-staff-queue.js`). SLA: `readiness.sla`. No stage, rule or endpoint was added.
- List: `GET /contact-requests?serviceKind=UMRAH` (search, status, paymentStatus, assignedUserId mine/unassigned/id, serviceId, createdFrom/To; 100 per page). Stage, package type, alerts and sort apply to the loaded page.
- The «العمرة» tab is a read-only summary: package and type (visa only / air / sea), preferred travel date (provisional), payment, next step, blockers, the server's steps, the guarantor (phone + «إقامة الضامن» with its review status), each pilgrim's documents and final file, and what still blocks closing. Work is done in the existing tabs (documents review, workflow: execution, final files) and payment decisions on «مراجعة الدفعات».
- Groups and packages screens moved unchanged to `/admin/umrah/groups` («مجموعات العمرة»), linked from `/admin/umrah`.

## Roles

| Role | `/admin/umrah` | Case tab | Groups |
|---|---|---|---|
| SUPER_ADMIN, ADMIN, EMPLOYEE | yes | yes | yes |
| ACCOUNTANT | read-only list (API allows list/detail for payment context) | no link | no |

The server refuses ACCOUNTANT workflow actions (start-execution, status, timeline → 403), checked by the e2e spec.
