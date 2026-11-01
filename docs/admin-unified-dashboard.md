# Unified administration dashboard

Owner decision, 2026-11-01: the Operations Center is the main administration
dashboard of Nasaem Al-Haramain. There is one staff back-office, not two.

## Entry and sign-in

| Address | What it is |
|---|---|
| `/admin` | The one staff entry. It is the Operations Center (`components/sections/operations-center.tsx`) inside the Admin Shell. |
| `/admin/login` | Staff sign-in (`components/admin/admin-login-form.tsx`). It calls the same `POST /api/auth/login` as before and gets the same cookie session. Then staff go to `/admin`, or to the `/admin/...` page they were sent from (`?next=`, same-site `/admin` paths only, see `safeAdminNext`). |
| `/admin/operations` | Kept for bookmarks: a permanent redirect to `/admin`. `/admin/operations/workflow` and `/admin/operations/pricing` are unchanged task pages inside the shell. |

The shell (`components/admin/admin-shell.tsx`) behaves as follows:

- A signed-out visitor goes to `/admin/login?next=<page>`.
- Sign-out goes to `/admin/login`.

## One navigation, by role

`navigationGroups` in `admin-shell.tsx` is the only staff menu. It has these groups:

- العمل اليومي
- العملاء والسجلات
- المال والتقارير
- الخدمات والموقع
- الطيران والنقل
- الفريق والنظام

Each item lists the roles of the backend routes it uses.

Server-side authorization is unchanged and remains the real boundary:

- Every `/api` route keeps its `requireAuth` / `requireRole`.
- CSRF and tenant checks are unchanged.
- The backend RBAC tests (`rbacMatrix`, `routeAuthorization`) still pass.

Hiding a menu item is only a convenience. A tool page also refuses a role it does not allow, with «هذا القسم غير متاح لدورك». The API answers 403 regardless of what the page shows.

## The old back-office screens

The static back-office (`backend/public`, copied to `web/public` by `scripts/sync-static-admin.mjs`) is no longer an admin of its own on the website.

**Replaced by `/admin` pages.** Opening one of these old addresses forwards to its replacement. The forwarding is in `assets/api.js` (`unifiedAdminTarget`). It is active only in the website copy, where the sync script sets `UNIFIED_ADMIN_PATH = "/admin"`.

| Old address | Unified page |
|---|---|
| `/login.html` | `/admin/login` |
| `/admin-dashboard.html`, `#/overview` | `/admin` |
| `#/requests[/<id>]`, `?customerRequest=` | `/admin/cases[?requestId=]` |
| `#/egypt` | `/admin/egypt` |
| `#/management` | `/admin/tools` |
| `#/orders`, `#/customers`, `#/flights` (+ id), `?order=`, `?customer=`, `?flightBooking=` | `/admin/tools/<orders\|customers\|flights>[?id=]` |
| `#/payments` | `/admin/tools/payments` |
| `/flight-management.html`, `/flight-bookings.html`, `/request.html` | `/admin/tools/flight-inventory`, `/admin/tools/flights`, `/admin/tools/new-order` |

**Not rebuilt yet, so they open inside the unified admin.** These are the `/admin/tools/<key>` screens listed in `components/admin/tools/admin-tools.ts`:

- orders
- customers
- flight bookings
- payments log
- office order entry
- Egypt prices and alerts
- payment accounts
- offers
- coupons
- branches
- suppliers
- flight inventory and exchange rates
- airlines
- airports
- ferries

How embedding works:

- The page frames the existing screen with `?embed=1`, and the old page drops its own header and tab bars.
- `?mgmt=<panel>` opens one management panel. `?only=egypt-settings` shows only the Egypt price and alert cards.
- The frame is same-origin. Its height follows its content, and the record it opens is mirrored in `?id=`.
- A session that ends inside the frame sends the whole page to `/admin/login`.
- The workflows, validations and server rules are exactly the existing ones; nothing was rewritten.
- These screens are restyled with the admin's Cairo font and navy/gold colours. They are the next candidates to rebuild natively.

**On the API host** (Railway backend), the old pages are still served for local use and CI. When `ADMIN_APP_URL` is set to the website origin, `backend/src/utils/adminAppUrl.js` redirects them there instead:

- It redirects with the same path, so the website copy maps the address, `#` route included.
- It applies only to GET and HEAD of the five pages.
- `ADMIN_APP_URL` must be an https origin; plain http is allowed only for localhost.

## Design

The admin design tokens are `app/admin/admin-theme.css`, scoped to `.nh-admin`:

- Cairo font
- Navy `#2E3792`
- Gold `#FAB60D`

Layouts are RTL. On desktop the rail is fixed (lg and up); on phone and tablet it becomes a drawer.

## Prices

Current prices are development test values (`TestDataNotice`). They stay configurable:

- `/admin/pricing`
- `/admin/tools/egypt-settings`
- the Umrah packages

No price is fixed in code by this change.

## Tests

| Test | What it covers |
|---|---|
| `web/e2e/admin-unified.spec.ts` | Sign-in and return to the requested page; a crafted `?next=`; `/admin/operations`; the old addresses; the embedded tools; roles (EMPLOYEE, ACCOUNTANT) with API 403; 360, 768 and 1280 px |
| `web/e2e/admin-shell.spec.ts` and `admin-operations-center.spec.ts` | Updated to `/admin` |
| `backend/tests/adminAppUrl.test.js` | The API-host redirect |
| `backend/tests/staticAdminSync.test.js` | The web copy matches its source |
