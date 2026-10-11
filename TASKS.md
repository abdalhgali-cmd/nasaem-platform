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
| GitHub Actions on #91 head | backup/restore drill (synthetic) ✅; Backend tests, Frontend typecheck + build, build-apk: running at time of writing |

## BLOCKED (needs owner / infrastructure)

- **Staging access**: staging exists on Railway (project `spirited-luck`, service `adaptable-quietude`, PostgreSQL 18, persisted `/data/uploads`). It is **not** disposable and Claude has no access. Deploying #91 to it needs explicit owner approval.
- **Staging backup + restore**: before any (separately approved) staging migration, a **real** staging PostgreSQL + `/data/uploads` backup and a successful restore must be verified. CI's synthetic backup/restore drill (green on #91) is not sufficient. Also follow `docs/admin-remediation-release.md` (roll-forward recovery: earlier refund/session migrations can make rollback to old app code unsafe). NOT TESTED.
- **Android build / devices**: no Android SDK here. CI's `build-apk` check result is recorded below once finished; no APK distributed; no real-device test. Installed-app compatibility on a device must be validated before enabling FIXED pricing.
- **Owner decisions**: real document requirements for flights/ferries/hotels; which services become FIXED (after the new app is distributed); payment accounts and exchange rates; legal/commercial texts.

## NEXT

1. Review and approve PRs #87 → #88 → #89 (or this integration PR) — merge needs owner approval.
2. Owner: verify a real staging DB + uploads backup and restore, then approve deploying #91 to Railway staging (`prisma migrate deploy` runs the two additive migrations).
3. Build and distribute the new Android app (signed release via `android-release.yml`, owner-triggered) **before** switching any service to FIXED — older installed apps can't approve quotes (`QUOTE_VERSION_REQUIRED`).
4. Staging smoke per `docs/staging-deployment.md`; then the production approval gate.

VERIFIED wording: app flight and hotel screens and the website flight search say results are agency-entered and that availability and final price are confirmed by staff before any payment (not live bookable inventory).

Known functional gaps (documented, not release blockers for QUOTE services): website/guided-intake/hotel/ferry forms don't show a fixed total, so FIXED items ordered there fall back to QUOTE.
