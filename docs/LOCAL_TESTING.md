# Local Testing Guide

Everything here is for **local development only**. None of these
credentials, seeded rows, or behaviors are valid — or even present — in
Production. Do not reuse any of these passwords anywhere real.

## 1. One-time setup

```bash
# 1. PostgreSQL — a local instance is enough; docker-compose.yml (repo root)
#    also brings up postgres+backend together if you prefer that.
createdb nasaem_platform_dev

# 2. Backend env
cd backend
cp .env.example .env
# Edit .env:
#   DATABASE_URL="postgresql://postgres:password@localhost:5432/nasaem_platform_dev?schema=public"
#   NODE_ENV=development
#   JWT_SECRET=<any long local-only string>
#   SEED_ADMIN_PASSWORD=<pick a local dev password>
#   UPLOAD_ROOT=uploads   (relative is fine outside NODE_ENV=production)
npm install
npx prisma migrate deploy
SEED_ADMIN_PASSWORD=<same value as in .env> npm run prisma:seed

# 3. Web env
cd ../web
cp .env.example .env.local   # NEXT_PUBLIC_API_URL="http://localhost:5000/api" is already the default
npm install
```

## 2. Running everything

```bash
# Terminal 1 — API + staff back-office (served same-origin)
cd backend && npm run dev

# Terminal 2 — public customer site
cd web && npm run dev
```

Heavy manual browsing/testing (many requests in a short window) can trip the
API's own rate limiters — they're deliberately strict (200 requests/15min
general, 10 logins/15min) since they're the same ones Production uses, not
a local-only stub. If you hit "Too many requests", either wait out the
15-minute window or restart the backend with a higher limit for that
session only (this is exactly what `.github/workflows/ci.yml`'s own `e2e`
job does for its Playwright run):

```bash
API_RATE_LIMIT=5000 npm run dev
```

The per-login limiter (`auth.routes.js`'s `loginLimiter`, 10/15min) isn't
configurable — it resets when you restart the backend, same as the general
one, since both are in-memory.

| Surface | URL |
|---|---|
| Customer website (Next.js) | http://localhost:3000 |
| API health check | http://localhost:5000/api/health |
| Staff login (static, same origin as the API) | http://localhost:5000/login.html |
| Staff admin dashboard | http://localhost:5000/admin-dashboard.html |
| Admin/manager app (Next.js, richer pricing/content UI) | http://localhost:3000/admin |

`GET /api/health` should return `{"success":true,...,"database":"connected"}`
before you rely on anything else being up.

## 3. Seeded / locally-created test accounts

None of these work anywhere but a database you seeded yourself with the
same `SEED_ADMIN_PASSWORD`. Passwords below assume you set
`SEED_ADMIN_PASSWORD=LocalDev@12345` and used the same value when creating
the others — pick your own value and adjust.

| Role | Email / phone | Password | How it was created |
|---|---|---|---|
| Super Admin | `admin@nasaem-platform.local` | `SEED_ADMIN_PASSWORD` value | `npm run prisma:seed` |
| Manager (`ADMIN` role) | `manager.dev@nasaem-platform.local` | pick your own | `POST /api/users` as Super Admin, `role: "ADMIN"` |
| Staff (`EMPLOYEE` role) | `staff.dev@nasaem-platform.local` | pick your own | `POST /api/users` as Super Admin, `role: "EMPLOYEE"` |
| Customer A | phone `0900000001` | pick your own | `POST /api/customer-auth/register` |
| Customer B | phone `0900000002` | pick your own | `POST /api/customer-auth/register` |

Manager/Staff sign in at `/login.html`. Customers sign in at `/account/login`
on the Next.js site, or verify by phone via the tracking flow (`/track`) —
no password needed there.

There is no login for "Provider" — a Supplier (embassy/agency/carrier) is a
staff-managed record (`Supplier` model, admin's Suppliers screen), not a
platform account. Staff hand work to a provider (email or manual-portal
channel); providers don't authenticate into NASAEM.

### Creating more test users/customers

```bash
# Log in as Super Admin first, keep the session cookie:
curl -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nasaem-platform.local","password":"<SEED_ADMIN_PASSWORD>"}'

curl -b cookies.txt -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{"fullName":"...","email":"...","password":"...","role":"EMPLOYEE"}'

curl -X POST http://localhost:5000/api/customer-auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"...","phone":"09...","password":"..."}'
```

## 4. Local-only OTP (tracking login code / password reset)

`requestLoginCode` (contact-request-tracking) and `requestPasswordReset`
(customer-auth) return the real 6-digit code as `debugCode` in the JSON
response whenever `NODE_ENV` is `"test"` **or `"development"`** — never in
`"production"`, where `NODE_ENV` is always `"production"` and `debugCode`
stays `undefined`. This is the only OTP path in local dev; no real
WhatsApp/SMS is sent (`sendWhatsAppMessage` no-ops with no provider
configured).

```bash
curl -X POST http://localhost:5000/api/tracking/request-code \
  -H "Content-Type: application/json" -d '{"phone":"0900000001"}'
# => {"success":true,"message":"...","debugCode":"456561"}

curl -c track.txt -X POST http://localhost:5000/api/tracking/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"0900000001","code":"456561"}'
```

## 5. Seed data specific to local testing

Beyond the platform's usual seed (services, packages, visa types,
requirements, homepage sections, feature flags), `prisma/seed.js` also
seeds, idempotently:

- **Exchange rates** (`Setting` rows `FX_SAR_SDG`/`FX_USD_SDG`/`FX_AED_SDG`/
  `FX_EGP_SDG`) — placeholder values only. Without these the public
  "يعادل تقريبًا ... جنيه سوداني" line never appears on a fresh database,
  because the flight_inventory migration pre-inserts these rows at `0`
  (meaning "unconfigured") and nothing else ever set them. Change them
  from Admin → Pricing → Exchange Rates at any time; the seed never
  overwrites a rate that's no longer `0`.
- **Two placeholder PaymentAccount rows** (one SAR, one SDG) — obviously
  fake bank details, only created if the table is completely empty. Replace
  or add to them from Admin → Payment Accounts before this ever leaves
  local development.

## 6. Verified end-to-end (this session, against this exact local setup)

1. **Multi-traveler Umrah submission** — `POST /api/contact-requests` with
   2 travelers, each with their own "passport" + "personal photo" files
   tagged via `documentTravelerIndexes`. Confirmed via
   `GET /api/contact-requests` that each document's `travelerId` points at
   the correct Traveler row (Traveler One's files never land on Traveler
   Two and vice versa).
2. **Pricing** — `GET /api/services/public/packages` returns
   `fxRateToSdg`/`priceSdg` computed from the seeded SAR→SDG rate.
3. **Staff review → payment flow**: staff set status `CONTACTED` and issued
   an invoice → customer (tracking session) approved it →
   `paymentStatus` became `AWAITING_TRANSFER` and the customer's tracking
   view exposed the seeded SAR payment account → customer uploaded a
   payment receipt and marked the transfer sent (`paymentStatus` →
   `UNDER_REVIEW`) → staff confirmed payment (`paymentStatus` → `CONFIRMED`,
   status label "تم تأكيد الدفع، جارٍ تنفيذ طلبك").
4. **Customer isolation** — Customer B's `GET /api/tracking/requests`
   never lists Customer A's request, and a direct
   `GET /api/tracking/requests/:id/documents/:documentId/file` for A's
   document while authenticated as B returns `404` (fails closed, doesn't
   even confirm the id exists).
5. **RBAC** — an `EMPLOYEE` session gets `403` on `PATCH .../assign` and
   `POST /api/users` (Manager-only), but `200` on reading the request list.

## 7. Restart / persistence check

```bash
# Stop both dev servers, then:
cd backend && npm run dev &
cd web && npm run dev &
```

Postgres data lives outside either process, so requests, documents (on
disk under `backend/uploads/`), seeded config, and logins all survive a
restart of the app processes. Only a `dropdb`/`createdb` (or Prisma
`migrate reset`) actually clears it — never do that against a database you
want to keep.
