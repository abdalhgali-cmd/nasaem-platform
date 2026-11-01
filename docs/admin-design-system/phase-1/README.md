# Admin design system — Phase 0 + 1 screenshots

Real rendered interface, not mock-ups. Captured on 31 Oct 2026 with Playwright (Chromium) against a local backend and a local PostgreSQL database seeded by `npm run prisma:seed`, after the e2e suite had created its own test requests. Names such as "Mobile E2E Customer" and "TEST-WF …" are e2e test records in that local database, not demo data in the application.

- **Before:** `bd7e3b9` (head of `fix/egypt-intake-staging-20261024`), production build.
- **After:** `feat/admin-ds-shell-20261031`, production build.
- Both were captured against the **same database state**.

| File | What it shows |
|---|---|
| `desktop-operations.png` | `/admin/operations` at 1440 px, SUPER_ADMIN, before and after |
| `desktop-employee.png` | `/admin/operations` at 1440 px, an EMPLOYEE account: role-filtered navigation |
| `mobile-390.png` | `/admin/operations` at 390 px |
| `mobile-390-menu.png` | The mobile navigation drawer at 390 px |
| `before-/after-users-1440.png` | `/admin/users` (team group, active item, breadcrumb) |
| `before-/after-payment-review-1440.png` | `/admin/payment-review`: page content unchanged inside the new shell |
| `before-/after-appearance-1440.png` | `/admin/appearance` with the new note that its colours apply to the public website only |

Horizontal overflow (`scrollWidth − innerWidth`) was 0 on every page, both before and after.
