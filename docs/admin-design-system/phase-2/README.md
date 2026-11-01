# Admin design system — Phase 2 (Operations Center) screenshots

Real rendered `/admin/operations`, captured on 31 Oct 2026 with Playwright (Chromium) against a local backend and a local PostgreSQL database (`npm run prisma:seed`, then the e2e journeys).

- **`TEST-OPS …` rows** are five synthetic Egypt clearance requests inserted into that disposable local database only, to show each signal:
  - travel in 2 days → amber;
  - travel date passed while still open → red;
  - internal `dueAt` passed → red;
  - overland with no travel date yet;
  - travel in 9 days.
- **`TEST-WF …` rows** are e2e test records.
- None of this exists in the application or on staging.

| File | What it shows |
|---|---|
| `operations-superadmin-1440.png` | SUPER_ADMIN, 1440 px: «ابدأ من هنا», queues, Egypt panel by travel date, Umrah panel, 6-column table, read-only payment summary, team workload |
| `operations-employee-1440.png` | EMPLOYEE, 1440 px: same queues, no team workload |
| `operations-accountant-1440.png` | ACCOUNTANT, 1440 px: general queues and payments only (the Egypt/Umrah queue endpoints are not open to this role, so they are not called) |
| `operations-superadmin-390.png` | SUPER_ADMIN, 390 px: stacked cards, no horizontal overflow |

Horizontal overflow was 0 and there were no failed API calls in all four captures.
