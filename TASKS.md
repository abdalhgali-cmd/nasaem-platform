# Nasaem Platform — Release Tasks

All critical automated suites pass on `claude/release-integration`; release is stopped at the approval gate (merge, staging, deployment).

Single source of truth for release progress. Only results of runs actually executed are recorded here; anything not run is listed as not run.

Integration branch: `claude/release-integration` = PR #87 (`claude/busy-hamilton-1ccxm1`) + PR #88 + PR #89 + the fix below. Not merged into `main`; nothing deployed.

## DONE (verified)

| Item | Evidence |
|---|---|
| PR #87 — explicit FIXED/QUOTE pricing, server-recomputed total + price snapshot, no quote stage for FIXED, payment locked until documents approved, admin config (back-office + Next.js), `/track` parity, interactive progress circles, Egypt task `systemKey`, test-only `PUBLIC_CONTACT_RATE_LIMIT` | PR #87 body; `docs/WORKFLOW-POLICY.md`, `docs/SERVICE-ACCEPTANCE.md` |
| PR #88 — a confirmed fixed total must also confirm its currency; app review refreshes the currency after `PRICE_CHANGED` | reviewed diff; `pricingModes*.test.js`, `mobile/tests/pricing-view.test.mjs` |
| PR #89 — `pendingReview: "false"` no longer becomes `true` (string truthiness); invalid flags rejected | reviewed diff; only caller (back-office) sends a real boolean; `paymentSettlement.test.js` |
| Audit-log race: airline create/update/delete now write the audit entry before responding | `activityLog.test.js` failed once in the full run (`AIRLINE_DELETED` missing), 5/5 green after the fix |
| Rollback check: `fixed-pricing-v1` capability required once the pricing migration is applied; existing FIXED requests named | `backend/src/release/compatibility.js`, `release-compatibility.json`, `rollbackSafety.test.js` |
| Railway staging plan (no live action) | `docs/RELEASE-91-RAILWAY-RUNBOOK.md` + `scripts/release-restore-drill.sh` |
| Website flight search says results are not instant bookings | `web/src/components/sections/flight-search-client.tsx` |
| Migrations `20261014090000_case_task_system_key`, `20261014100000_explicit_pricing_mode` are additive | upgraded a DB at the previous schema with data in place: Egypt tasks keyed, manual tasks untouched, existing items stay `QUOTE`, invoices unchanged |

## Test results on `claude/release-integration`

| Suite | Result |
|---|---|
| Targeted (pricing, payments): `pricingModes.test.js`, `pricingModes.unit.test.js`, `paymentSettlement.test.js` | 44/44 |
| Backend full (`node --test`, fresh isolated PostgreSQL), before the airline fix | 850/851 — the one failure is the audit race fixed above |
| Backend full, after the airline fix (fresh DB) | **851/851** |
| Mobile unit (`mobile/tests`) | 74/74 |
| Mobile JS syntax check (`npm run check`) | ok |
| Web typecheck / lint / `next build` | ok / ok / ok |
| Back-office copy sync check | ok |
| Playwright, all projects (Chromium, local backend on this branch) | **87/87** |
| GitHub Actions run 507 on `5098dba` | Playwright E2E ❌ 86/87: `platform3` "Security approvals" raced its own upload (test waited for text already on the page). Test fixed in `5c9ca08` (waits for the 201 upload response); passes locally |
| GitHub Actions on `5c9ca08` and `19387de` | all check suites completed with no failure (the Playwright test fix is green in CI) |
| **GitHub Actions on `ca2461f`** (release candidate code head; later commits change `TASKS.md` only) | **Backend tests ✅, Frontend typecheck + build ✅, Playwright E2E ✅, PostgreSQL backup + restore drill (synthetic) ✅, build-apk ✅** |
| **GitHub Actions on `a65b275`** (current code head: drill hard-fail + CI drill steps) | **Backend tests ✅, Frontend typecheck + build ✅, Playwright E2E ✅, PostgreSQL backup + restore drill ✅ (incl. the release drill: passes on the clean dump, fails as required on a FIXED dump), build-apk ✅** |
| Vercel status on #91 | ❌ "Account is blocked" — Vercel account issue, not code; owner must resolve in Vercel |
| Rollback guard (`rollbackSafety.test.js`, `startupGuard.test.js`) incl. new fixed-pricing case | 24/24 (local, disposable DB) |
| `scripts/release-restore-drill.sh` on a synthetic `main`-schema dump | applies 11 migrations; counts and payment total unchanged; all items `QUOTE`; rollback-check exit 2 (roll-forward only, expected); uploads check 0 missing; refuses non-local hosts. **Synthetic only: not evidence of a real staging backup.** |
| Drill is now a hard pass/fail (owner review on #91, 2026-10-12) | exits non-zero on: changed counts/payment total, any FIXED item or request, rollback-check exit ≠ expected (default 2), missing upload files, or no uploads archive (unless `DRILL_ALLOW_NO_UPLOADS=1`, CI only). `releaseDrillChecks.test.js` 5/5; local runs: clean → 0, FIXED → 1, no uploads → 1, wrong rollback exit → 1. CI backup job now runs the script twice (must pass / must fail on a FIXED service) |

## BLOCKED (needs owner / infrastructure)

- **Staging access**: staging exists on Railway (project `spirited-luck`, service `adaptable-quietude` on `f2616659`, DB `Postgres-_h_s` PostgreSQL 18, uploads volume at `/data/uploads`; owner inventory 2026-10-12). It is **not** disposable and Claude has no access. The DB has no public TCP proxy (do not open one). Deploying #91 applies **6** migrations on staging (11 vs `main`) and needs explicit owner approval.
- **Staging backup + restore**: NOT DONE — Drive backup folder empty; no verified external encrypted backup; no real restore test (owner inventory 2026-10-12). Before any (separately approved) staging migration: Railway manual snapshots of both volumes **plus** an off-platform encrypted PG18 custom-format dump and uploads archive via a private route, then `scripts/release-restore-drill.sh` with `ROLLBACK_REF=f2616659…` must exit 0 (`docs/RELEASE-91-RAILWAY-RUNBOOK.md` §2–§3). Never use Railway **Restore** on staging for a test. CI's synthetic backup/restore drill (green on #91) is not sufficient. Also follow `docs/admin-remediation-release.md` (roll-forward recovery: earlier refund/session migrations can make rollback to old app code unsafe). NOT TESTED.
- **Android build / devices**: no Android SDK here; CI `build-apk` is green on `ca2461f` (CI build only, nothing distributed); no real-device test. Installed-app compatibility on a device must be validated before enabling FIXED pricing.
- **Owner decisions**: real document requirements for flights/ferries/hotels; which services become FIXED (after the new app is distributed); payment accounts and exchange rates; legal/commercial texts.

## NEXT

1. Owner review of #91 (CI green on `a65b275`; Vercel status is an account block, not code) — merge needs owner approval.
2. Owner: follow `docs/RELEASE-91-RAILWAY-RUNBOOK.md` — real staging DB + `/data/uploads` backup, run `scripts/release-restore-drill.sh` on it, then approve deploying #91 to Railway staging. Note: the container runs `prisma migrate deploy` on start, so deploying to staging (currently `f2616659`) applies **6** migrations (11 vs `main` for production); afterwards the environment is roll-forward only.
3. Build and distribute the new Android app (signed release via `android-release.yml`, owner-triggered) **before** switching any service to FIXED — older installed apps can't approve quotes (`QUOTE_VERSION_REQUIRED`).
4. Staging smoke per `docs/staging-deployment.md`; then the production approval gate.

VERIFIED wording: app flight and hotel screens and the website flight search say results are agency-entered and that availability and final price are confirmed by staff before any payment (not live bookable inventory).

## Follow-up branch `claude/release-next` (base `claude/release-integration`, not merged)

| Item | Evidence |
|---|---|
| Staff `CASE_ASSIGNED` notification now links to the assigned request (`contactRequestId`); all other staff/customer request notifications already did | `notificationContactRequestLink.test.js` 2/2 |
| `POST /api/intake-drafts/:token/submit` accepts `acceptedTotal`/`acceptedCurrency` with the app's server pricing: match → FIXED + approved invoice; missing/wrong currency or total → 409 `PRICE_CHANGED`, nothing created, draft intact; no total → QUOTE (reason kept); total on a quoted item → 409 `PRICING_MODE_CHANGED` | `intakeDraftPricing.test.js` + `intakeDrafts.test.js` 11/11 (fresh DB) |
| Website service wizard (umrah/package/visa; posts `/contact-requests`): FIXED items show the server-equivalent final total (per traveler/per request) and currency, require an explicit confirmation, send `acceptedTotal`/`acceptedCurrency`; 409 `PRICE_CHANGED` replaces the total and asks again; quoted items label their figure as an estimate; success screen states the payment next step for FIXED | UI: `web/e2e/website-fixed-price.spec.ts` (API mocked). **Real backend** (owner review on #92): `web/e2e/website-fixed-price-real.spec.ts` — the wizard's multipart `POST /api/contact-requests`; agency reprices after review → 409, no request created, new total shown, re-confirmed → FIXED request + approved invoice at the new price: 1/1 local. Draft-submit route verified separately by `intakeDraftPricing.test.js` |
| Android release workflow: `version_name` validated (`X.Y.Z`) and passed via env (was interpolated into shell/node); device checklist includes the QUOTE/FIXED checks | `android-release.yml`, `docs/ANDROID-RELEASE.md` — NOT RUN (owner-triggered, needs signing secrets) |
| Flights/hotels/ferries readiness: website and app wording reviewed — flight results are agency-entered, hotels/ferries are requests whose availability and price staff confirm; no instant-booking claims | grep review; no code change needed |

**GitHub Actions on `3328e17` (PR #92)**: Backend tests ✅, Frontend typecheck + build ✅, Playwright E2E (full suite, incl. `website-fixed-price.spec.ts`) ✅, PostgreSQL backup + restore drill ✅. The local full Playwright run did not finish (session time limit); CI is the evidence.

Remaining known gaps (not blockers while every service is QUOTE): hotel and ferry forms have no fixed-total step (a FIXED item there falls back to QUOTE, never charged unseen). FIXED stays disabled until the new Android app is distributed and checked on a real device.
