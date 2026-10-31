# Admin design system — Phase 3: Egypt Case Workspace

Real rendered interface (Playwright/Chromium, production build, local backend + disposable local PostgreSQL). Rows named «TEST-OPS …» are synthetic records inserted only into that local test database; «EGYPT-WS …» is a request created by the e2e spec through the public intake API. No demo data exists in the application.

| File | What it shows |
|---|---|
| `egypt-queue-1440.png` | `/admin/egypt` — travel schedule (nearest date first), alert counts, filters, stage counts |
| `egypt-queue-390.png` | The same page at 390 px (rows become cards) |
| `egypt-case-1440.png` | `/admin/cases?requestId=…&tab=egypt` — the «الموافقة الأمنية» tab |
| `egypt-case-390.png` | The same tab at 390 px |

Horizontal overflow at 390 px: 0 on both pages.

## What is connected (existing backend only)

- Queue: `GET /contact-requests/egypt/queue` (view, stage, filter, entryMode, assignee mine/unassigned/id, from/to travel date, search). Stages, stage labels, order and next action are computed by the server.
- Case tab: `GET /contact-requests/:id/egypt` and the existing transitions — `PATCH /:id/priority`, `POST /:id/egypt/approval`, `PATCH /:id/egypt/travel-date`, `POST /:id/egypt/tickets`, `PATCH /:id/egypt/flight-details`, `POST /:id/egypt/circular/processing`, `POST /:id/egypt/circular`, `POST /:id/payment-receipt/resend`. Each is role-checked (SUPER_ADMIN, ADMIN, EMPLOYEE), state-checked and audited by the server.
- Customer data, travellers, documents, notes and the action log stay in the existing tabs of the case workspace.
- No new states, rules, endpoints or permissions. Payment confirmation stays on «مراجعة الدفعات».

## Not migrated yet (still only in the static back-office)

- Egypt alert settings (`PUT /egypt/alert-settings`) and Egypt pricing administration.
