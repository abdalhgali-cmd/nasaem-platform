# Nasaem Platform 2.0 — Execution Checklist

## Goal
Reduce staff clicks, enforce a single service workflow, and make payment/document handling operationally explicit without changing the flight integration or adding Trip.com.

## Batch 1 — Operations
- [x] Unified operations queue
- [x] Next-action classification
- [x] Stalled-request age tracking
- [x] Queue counters
- [x] Staff-safe operations API
- [x] Assignment action from operations center (`PATCH /api/orders/:id/assign`, "تعيين لي" quick action)
- [x] Search/filter controls in UI (order #, name, phone, passport, service, employee, status, payment, stalled, urgent)

## Batch 2 — Workflow
- [x] Define canonical lifecycle states (already in `OrderStatus`, unchanged)
- [x] Enforce legal transitions server-side (`ORDER_STATUS_TRANSITIONS`, pre-existing — verified with tests)
- [x] Block issuance before confirmed payment and required documents (payment must be PAID + every service-required document type uploaded — see Batch 3)
- [x] Audit every state transition (`OrderStatusHistory`, pre-existing — verified with tests)

## Batch 3 — Payments & Documents
- [x] Payment amount/balance summary (pre-existing: total/paid/remaining/currency via `recalculateOrderPaymentStatus`)
- [x] Payment rejection reason (`Payment.rejectionReason`, migration `20260823132043_add_payment_review_status`)
- [x] Receipt review action (`POST /api/payments/:id/confirm`, `POST /api/payments/:id/reject`; staff UI at `/admin/payment-review`)
- [x] Required-document checklist (per-service-category, code-level map in `orders.service.js` — flight/hotel/ferry/tasheel/egypt_clearance need a passport; umrah/family_visit/work_visa/intl_visa/package also need a photo; unlisted categories default to passport-only)
- [ ] Delivery readiness guard — not built as a distinct guard; COMPLETED already requires payment+documents, which is the readiness signal the schema supports today

## Batch 4 — Automation
- [x] Notification event map (existing per-action notifications reviewed; payment-review adds PAYMENT_PENDING_REVIEW/PAYMENT_CONFIRMED/PAYMENT_REJECTED WhatsApp+internal notifications, no duplicates)
- [x] Customer 360 summary (pre-existing, verified)
- [ ] Financial reporting with supplier cost — **not attempted**: `OrderItem`/`Supplier` have no cost field in the schema; adding one is a real migration this pass didn't have budget to design, seed-migrate, and test properly. Current dashboard correctly reports Revenue only and never labels it "profit" (see `dashboard.service.js` `profitNote`).
- [ ] Group/Umrah batch readiness — **not attempted**: no `Group`/`Batch` model exists; this is a new subsystem, not a safe incremental change to make without a dedicated pass.

## Batch 5 — Quality
- [x] Mobile-first operation actions (Operations Center already responsive; verified real rendering in a browser at desktop width — no dedicated narrow-viewport pass this round)
- [ ] Performance indexes/pagination review — new order filters (`serviceId`, `assignedUserId`, `search`) reuse existing indexed columns (`assignedUserId`, `Customer.phone/passportNo`) except `orderNumber`/`customer.fullName` `contains` search, which is not index-accelerated; not addressed this round
- [x] Security review — found and fixed a real IDOR (flight booking documents/details downloadable by anyone who had a booking id/number, no ownership check); RBAC coverage audited across all route files
- [x] End-to-end workflow tests — added payment review, order search/assign, document-type-aware completion, and flight-booking file-isolation regression tests (all run against a real Postgres DB via the real HTTP API)
- [ ] Single final production verification — see final report; Railway/Vercel/domain checks require dashboard/deploy access this session does not have

## Constraints
- Do not modify Trip.com integration.
- Do not change the flight system unless required to fix a regression.
- Avoid unnecessary production deployments while the Vercel deployment limit is active.
- Do not declare production-ready until the final end-to-end verification passes.
