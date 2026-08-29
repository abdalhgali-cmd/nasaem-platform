# Platform 3.0 — Pre-flight Audit

Branch: `feature/platform-3-admin-controlled` (from `main` @ `220038e`, which already
contains PR #31 — Operations 2.0/Payment review/Umrah Groups/Financials/IDOR fix).

## Repository

- `git status`: clean at branch creation. `main` CI: green (verified via GitHub Actions
  after PR #31 merge).
- Single CI workflow (`.github/workflows/ci.yml`): backend tests only, real Postgres
  service container, `prisma migrate deploy` + seed before `npm test`. No frontend
  typecheck/build/E2E step in CI today (Phase 20 needs to add these, carefully — see
  Risks below re: Vercel rate limits and the new Playwright suite's DB dependency).
- Vercel is connected via GitHub App (preview deployments + PR status check).
  Railway is not visible from GitHub (no Actions workflow, no commit status) — its
  state cannot be inspected from this session; confirmed in the prior session's final
  report (network egress to the production domain is blocked here).
- Three apps: `backend/` (Express API), `frontend/` (vanilla JS staff back-office,
  served by the Express app, same-origin), `web/` (Next.js 16 marketing site + admin
  Operations/Payment-Review pages, deployed separately to Vercel).

## Backend — schema (`backend/prisma/schema.prisma`, 682 lines, 34 models)

Relevant existing building blocks (reuse, do not duplicate):

| Need | Existing model/mechanism | Fit |
|---|---|---|
| Arbitrary admin-set key/value config | `Setting` (key unique, value string) + `GET/POST /api/settings` (SUPER_ADMIN/ADMIN) | Good fit for singleton values: hero text/CTA, theme color tokens, feature flags, FX rates (already used this way by `flights.service.js`) |
| Branding images (logo, icons) | `SiteAsset` (key unique, file metadata) + `GET/POST /api/site-assets`, public `GET /api/site-assets/:key/file` | Good fit for favicon + any new homepage image slot — just extend `SITE_ASSET_KEYS` |
| Services | `Service` (code, name, category, description, basePrice, currency, active) — no `imageKey`, `icon`, `sortOrder`, or `featured` flag yet | Needs 3-4 new nullable columns, not a new model |
| Visa types | `VisaType` (code, name, country, description, basePrice, currency, active, serviceId) — no `nameEn`, `type`, `processingTime`, `stayDuration`, `validity`, `entryType`, `sortOrder` | Needs new nullable columns |
| Visa/service document requirements | **Code-level only** — `SERVICE_DOCUMENT_REQUIREMENTS` map in `orders.service.js`, keyed by `Service.category`, values are `DocumentType[]`. No DB table, no per-visa granularity, no min/max files, no "review required"/"OCR enabled" flags, no display order | Needs a new model (`ServiceRequirement` or similar) |
| Document type enum | `DocumentType` (PASSPORT/PHOTO/VISA/TICKET/RECEIPT/OTHER) — fixed enum, `Document` has no per-requirement link, no status/review field | Order documents currently have **no download route at all** (flagged in the prior session's release notes as a known gap) and no status/reviewedBy — `ContactRequestDocument` (a different, parallel model for the pre-order intake flow) already has `status`/`reviewedByUserId`/`reviewedAt`/`reviewNote`, which is the pattern to mirror rather than reinvent |
| RBAC | `UserRole` enum: `SUPER_ADMIN`, `ADMIN`, `EMPLOYEE`, `ACCOUNTANT`. `requireAuth` + `requireRole(...)` middleware, applied per-route consistently across every module audited | No `OPERATIONS`/`FINANCE`/`CONTENT_MANAGER` yet — plan says add only if genuinely needed; given `ADMIN` already has full config access and `EMPLOYEE`/`ACCOUNTANT` are scoped operationally, a new `CONTENT_MANAGER` role *is* warranted for Phase 1-9 (content/config editing without financial/ops access) |
| Audit log | `ActivityLog` (userId, action, entity, entityId, ipAddress, userAgent, createdAt) + `logActivity()` util (best-effort, fire-and-forget, already called from ~15 call sites) | Good fit — **no old/new value columns today**; Phase 16 needs 1-2 new nullable JSON columns (`oldValue`/`newValue`), never populated with secrets/tokens/passport bytes |
| Feature flags | None | Needs a new model — `Setting` could technically hold booleans as strings, but a dedicated `FeatureFlag` (key, service scope, enabled, description) is cleaner for Phase 13's per-service scoping and is queried differently (server-side gate on nearly every write route) than admin-only config values |

**Not in Prisma at all (raw SQL, hand-migrated, no model):**
`flight_bookings`, `flight_inventory`, `flight_bank_accounts` — confirmed hazard from
the plan's own warning. `flight_inventory` stores `airline_name`/`origin_name`/
`origin_code`/`destination_name`/`destination_code` as **plain denormalized text**,
no FK to any directory. Every `prisma migrate dev` run in this repo's history has
proposed `DROP TABLE` for these three (caught and hand-fixed 3 times already this
project — see `migrationIntegrity.test.js`, which already guards this in CI).

**Ferries**: no dedicated model at all — `ferry` is just a `Service.category`,
flowing through the generic Order/OrderItem pipeline like every other service.
`ferry-service-client.tsx` (web) and `ferryIntake.test.js` (backend) only exercise
that generic path. Phase 9 needs a real `FerrySchedule`-type model.

**Flight search/business logic** (`flights.service.js`, `flights.controller.js`,
`trip.provider.js`): `trip.provider.js` is a generic external-provider adapter
(env-gated via `TRIP_API_URL`/`TRIP_API_TOKEN`, both empty in every env available to
this session) — **this is the "Trip.com" the plan forbids touching**; it already
correctly returns `{configured: false, legs: []}` when unconfigured rather than
inventing flights, matching Phase 12's requirement out of the box. `searchManualFlights`
filters `flight_inventory` rows to Sudanese airlines only (`isSudaneseAirline()`,
a hardcoded name-matching set) — this is deliberate business logic, not a bug;
Phase 10 (Airline Directory) must not touch this filter, only add optional
display enrichment (logo lookup by name).

## Backend — modules already covering plan requirements

- **Passport OCR** (`passport-ocr.service.js`): real Tesseract.js + MRZ checksum
  validation, vendored language data (no network at runtime), already compares
  against a `Customer` record when `customerId` is given (added last session).
  Phase 7 needs: make it *configurable per service/visa* (currently it's a single
  global endpoint, always available to SUPER_ADMIN/ADMIN/EMPLOYEE) — additive.
- **WhatsApp** (`whatsapp.js`): env-gated (`WHATSAPP_API_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`),
  not configured in any environment available here, phone normalization already
  centralized. No inbound webhook handling exists.
- **Notifications**: internal (`Notification` model, per-user) + WhatsApp (best-effort).
  No email channel.
- **Operations Center / Payment review / Umrah Groups / Financials**: all real and
  tested per the prior session (208 backend tests passing at branch creation).

## Frontend (`web/`)

- Homepage (`src/app/page.tsx`): 10 sections, all **fully hardcoded** in their own
  component files (`hero.tsx`: title/description/CTA/stats hardcoded, no image
  concept — background is a CSS gradient, not an uploaded image; `services.tsx`:
  7 hardcoded service cards with Lucide icons, no DB-backed order/visibility).
- Theme: Tailwind v4 `@theme` + CSS custom properties in `globals.css`
  (`--color-primary`/`--color-secondary`/`--color-accent`/etc., light block on
  `:root`, dark block under `prefers-color-scheme`/`[data-theme=dark]`) — exactly
  the token-based architecture the plan wants; making it admin-configurable means
  injecting a small override `<style>` block server-side (root layout) from
  `Setting` rows, not touching the Tailwind config.
- Existing precedent for "admin-editable, cached, falls back to bundled default":
  `src/lib/site-assets.ts` (`revalidate: 60`, never throws, falls back silently) —
  this is the pattern Phase 1/2's public read path should follow.
- Admin UI today: `frontend/admin-dashboard.html` (vanilla JS, Management tab with
  sub-tabs per entity — Branches/Suppliers/Services/Offers/Users/Settings/Activity/
  Contact Requests/Umrah Groups/Site Assets) is the *only* admin surface for
  CRUD-style config; `web/src/app/admin/*` (Next.js) is Operations/Payment-Review/
  Delivery/Pricing only, task-oriented rather than config-oriented. Phase 14's
  "Configuration Center" fits the vanilla admin dashboard's existing tab pattern
  best — consistent with where Umrah Groups' admin UI was added last session —
  though new tabs will be added there rather than to `web/admin`.

## Tests

- Backend: 208 tests (`node --test`, real Postgres), all passing at branch creation.
- `web/`: `tsc --noEmit` clean, `next build` clean, `eslint` has 8 pre-existing
  errors/19 warnings unrelated to this work (not introduced by prior session, left
  as-is per "avoid unrelated refactors").
- `web/e2e/`: Playwright suite added last session (Operations/Payment-Review/
  Documents-intake at mobile viewports), **not wired into CI** — requires a live
  backend + seeded Postgres + both dev servers, which CI's current job doesn't
  provision. Phase 20 needs this if E2E is to run in CI; otherwise it stays a
  manual/local-only regression suite (acceptable — the plan says "avoid unnecessary
  Vercel deployments" and doesn't mandate CI wiring, just that E2E "passes").

## Risks / recommended order

1. **Migration hazard is real and recurring** — every `prisma migrate dev` in this
   repo's history has proposed dropping the 3 raw-SQL flight tables. Every new
   migration this phase produces must be hand-reviewed before commit (established
   procedure from the prior session); `migrationIntegrity.test.js` is the safety
   net, already in `main`.
2. Reuse `Setting` and `SiteAsset` aggressively (Phases 1, 2, 13 partially) before
   reaching for new models — most of Phase 1/2's needs are singleton config values
   and image slots, both already have working, tested infrastructure.
3. New models are genuinely needed for: `HomepageSection` (Phase 1 — the six/seven
   service cards need order+visibility+per-row image, which `Setting` can't express
   as a list), `ServiceRequirement`-style checklist config (Phase 5-6), `FerrySchedule`
   (Phase 9), `Airline`/`Airport` directories (Phase 10-11), `FeatureFlag` (Phase 13).
   Extend `Service`/`VisaType` with new nullable columns rather than new tables
   (Phase 3-4).
4. RBAC: add `CONTENT_MANAGER` (content/config only, no financial/operational
   routes) since Phase 15 explicitly calls for it and today's roles don't cover
   "can edit homepage/theme but not payments/orders."
5. Order: follow the plan's own batch grouping (Homepage/Theme → Services/Visas/
   Requirements/Attachments/OCR → Security Approvals/Ferries → Airlines/Airports/
   Flight/Schedule → Feature Flags/Admin/RBAC/Audit → Performance/Security/Testing/
   Release), since later batches (Security Approvals reusing the order engine,
   Feature Flags gating services) depend on earlier ones (Service extensions,
   Requirements engine) existing first.
6. Flight Search Provider (Phase 12): no real provider credentials exist in any
   environment reachable from this session. Will be marked `NOT CONFIGURED`, not
   invented — the existing `trip.provider.js` abstraction already does this
   correctly and will not be modified.

## Conclusion

Proceeding to Batch 1 (Homepage/Theme). No blind changes made; every reuse decision
above is grounded in an actual file read, not an assumption.
