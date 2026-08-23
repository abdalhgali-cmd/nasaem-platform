# Release notes — Operations/Payments/Security hardening (2026-08-23)

Branch: `claude/dreamy-thompson-b8xp1y` (continues `feature/platform-improvements-2`).

## What changed

**Operations Center**
- `GET /api/dashboard/operations` now returns `serviceId`, `assignedUserId`,
  and `hasPaymentUnderReview`/`pendingPayment` per item.
- `GET /api/orders` accepts `search` (order #, customer name/phone/passport),
  `serviceId`, `assignedUserId` (`UNASSIGNED` for none), `paymentStatus`,
  `stalledHours`.
- New `PATCH /api/orders/:id/assign` (`{ assignedUserId }`, null to unassign).
- Web Operations Center (`/admin/operations`) gained service/employee filter
  dropdowns and a "تعيين لي" (assign to me) quick action.

**Payments**
- `Payment` gained an optional review lifecycle: `reviewStatus`
  (PENDING/CONFIRMED/REJECTED), `rejectionReason`, `reviewedByUserId`,
  `reviewedAt`. Existing rows are unaffected (`reviewStatus` is null —
  "recorded directly by staff, no review used", the pre-existing behavior).
- `POST /api/payments` accepts `pendingReview: true` to log a payment
  awaiting confirmation (`status: UNPAID`, doesn't move the order's balance)
  instead of counting it immediately.
- New `POST /api/payments/:id/confirm` and `POST /api/payments/:id/reject`
  (`{ reason }`). Only a PENDING payment can be confirmed/rejected once.
- Fixed a latent bug: `recalculateOrderPaymentStatus` used to count any
  payment whose `status` wasn't `REFUNDED` (including a stored `UNPAID`
  payment) toward the paid total. It now only counts `PAID` payments.
- `/admin/payment-review` now also lists Order-sourced pending payments
  (previously ContactRequest-only) with confirm/reject actions.

**Order completion**
- Required-document checklist is now per Service.category instead of "any
  one document uploaded": flight/hotel/ferry/tasheel/egypt_clearance need a
  passport; umrah/family_visit/work_visa/intl_visa/package also need a
  photo; an unlisted category defaults to passport-only. See
  `SERVICE_DOCUMENT_REQUIREMENTS` in `orders.service.js`.

**Security fix — flight booking document/detail IDOR**
- `GET /api/flight-bookings/:id/file/:kind` (provisional ticket, payment
  receipt, final ticket) had no ownership check at all — anyone who had a
  booking id or the short, guessable `booking_number` could download
  another customer's documents. It now requires a `phone` query parameter
  that must match the booking's customer phone (same check already used by
  `/public/:id` and the payment-receipt upload).
- `GET /api/flight-bookings/:id` (full booking JSON: name, phone, amount,
  passengers) was also unauthenticated. It now requires staff login.
- Staff still need to download booking files from the admin panel; a new
  staff-only `GET /api/flight-bookings/:id/staff-file/:kind` route (behind
  `requireAuth` + role) was added for that, and
  `frontend/assets/flight-bookings-admin.js` now points at it.
- The two customer-facing pages that link to booking files
  (`web/src/app/flight-booking/page.tsx`,
  `web/src/components/sections/flight-booking-client.tsx`) now pass the
  phone the customer already entered — no UX change for a legitimate owner.

## Migrations

One new migration: `backend/prisma/migrations/20260823132043_add_payment_review_status/`.
Purely additive — new enum `PaymentReviewStatus`, four new nullable columns
on `Payment`, one new index, one new FK. No data loss, no backfill needed,
safe to run against the existing production database with
`prisma migrate deploy`.

**Caution for future migrations on this repo**: `flight_bookings`,
`flight_inventory`, and `flight_bank_accounts` are managed by hand-written
SQL (see `flight-bookings.service.js`) and intentionally have no Prisma
model. Running `prisma migrate dev` to generate a new migration will,
by default, propose `DROP TABLE` statements for those three tables because
Prisma's schema diff doesn't know about them. **Always inspect a
freshly-generated migration.sql before applying it** — strip any DROP
TABLE/DROP CONSTRAINT statements touching `flight_*` tables. This migration
had exactly that problem and was hand-fixed before being committed; the
underlying diff behavior is pre-existing and unrelated to this change.

## Environment variables

No new environment variables were introduced. `WHATSAPP_API_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID` (pre-existing, optional) still gate whether
payment confirm/reject WhatsApp notifications actually send — without them
`sendWhatsAppMessage` is a no-op, as before.

## Manual steps required after deploying this branch

1. Run `npx prisma migrate deploy` against the production database (adds
   the `Payment` review columns — safe, additive, no downtime expected).
2. No seed changes, no data backfill, no manual data fixes needed.
3. Nothing to configure for WhatsApp/OCR — both already existed and are
   unchanged by this pass; WhatsApp only sends if the token/phone-number-id
   env vars above are set in that environment.

## Known gaps (deliberately not attempted this pass)

- Supplier cost / gross-profit reporting — no schema field for supplier
  cost exists; adding one needs its own scoped migration + reporting pass.
- Umrah Groups/Batch workflow — no `Group`/`Batch` model exists; this is a
  new subsystem, out of scope for an incremental hardening pass.
- Order documents have no staff-facing download route at all currently
  (no regression — this predates this branch); flagged for a future pass.
- Narrow-viewport (phone-width) UI pass — Operations Center already uses
  responsive Tailwind breakpoints and was verified rendering correctly in a
  browser, but no dedicated mobile-viewport QA pass was done this round.
