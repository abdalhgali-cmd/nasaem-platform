# Stages 9–14 status

## Stage 9 — Hotels
- Replaced placeholder hotel price cards with an actual hotel request flow.
- Validates check-in/check-out ordering, guest count, and room count.
- Uses the catalog-backed `SVC-HOTEL` service.
- Stores city, dates, guests, rooms, and notes in the existing ContactRequest intake workflow.
- Live hotel inventory/API remains intentionally separate from this request flow.

## Stage 10 — Security & roles
- Existing API routes use authentication and role middleware.
- Added regression tests for unauthenticated dashboard/customer access.
- Added regression test to ensure dashboard response does not expose password hashes.
- Existing roles: SUPER_ADMIN, ADMIN, EMPLOYEE, ACCOUNTANT.

## Stage 11 — Admin dashboard
- Existing dashboard and management UI remain the operational back office.
- Dashboard stats endpoint is restricted to SUPER_ADMIN/ADMIN.
- Customer, payment, order, service, notification, activity-log and administration modules already expose role-specific routes.
- Further UI consolidation can be done without changing API contracts.

## Stage 12 — Mobile
- Public service intake and hotel/ferry forms use responsive Tailwind layouts.
- Flight, Umrah, Visa, Ferry and Hotel flows use mobile-safe controls and responsive grids.
- Final device pass remains a release validation item.

## Stage 13 — Full test
- CI covers backend migrations, seed, unit/integration tests, service intake, flights, Umrah, ferry and finance/security regression tests.
- Final end-to-end production smoke pass remains required before declaring release complete.

## Stage 14 — Production
- Vercel production deployments have repeatedly reached READY on the main branch during this implementation cycle.
- Railway is the backend production target.
- Final release gate is CI green + Vercel READY + Railway healthy + production smoke test.

Trip.com remains deferred and is not part of stages 9–14 acceptance.
