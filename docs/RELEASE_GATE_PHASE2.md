# Phase 2 release gate — readiness (#97) and acceptance matrix (#110)

**Decision: BLOCKED.** Not ready for staging or production. The reasons are in §3. This document grants no permission to deploy, migrate, merge into `main`, change DNS or contact customers.

Base: `integration/phase2-completion-20261017` (`394f071`, a docs-only commit on top of `ba05b6c`, which is PR #120). It adds **no migrations** beyond the 13 that #91 already carries over `main`. The staging runbook and restore drill therefore apply as they are: `docs/RELEASE-91-RAILWAY-RUNBOOK.md`, `scripts/release-restore-drill.sh`.

## 1. CI evidence per SHA (#97)

| SHA | What it is | Backend | Web typecheck + build | Playwright | Backup drill (synthetic) | APK build | Evidence |
|---|---|---|---|---|---|---|---|
| `ba05b6c` | #111 → #115 → #112 → #113 → #116 → #117 → #118 → #114 combined (PR #120) | ✅ | ✅ | ✅ | ✅ | ✅ | GitHub Actions runs 39050216001 and 39050216016. Local on fresh DBs: backend 911/911, Playwright 111/111, mobile 88/88 |
| `2afa6cf` / `94e34fd` / `ebec6e0` / `3db91d7` / `f81ba0a` | PR heads #112 / #113 / #116 / #117 / #118 | ✅ | ✅ | ✅ | ✅ | — | each PR's checks |
| `2a50cd4` (`main`) | `main` today | ✅ | ✅ | ❌ 1 failed | ✅ | — | run 38452826186 (details below) |

`platform3.spec.ts:586` (security approval lifecycle) fails on `main`: the staff list does not yet contain the request, so `documents[0]` is read from `undefined`.
- **Cause:** a race. The test went on as soon as the page showed «قيد المراجعة», which appears before the upload is sent.
- **Fix:** already on the integration line. The test now waits for the `POST …/documents` 201 response, and every assertion is kept.
- **Result:** it passes in #120's CI.
- **Still open:** `main` also has two workflow-only commits (`b93f3b4`, `2a50cd4`, the AI Dev Orchestra workflow) that are not in the integration line. They touch only `.github/`, but they must be merged in before any release PR to `main`.

The Vercel check fails on every PR with "Account is blocked". That is an account problem, not the code (#63).

## 2. Deploy order once approved (#97)

Each step needs its own owner approval. None of these steps has been done.
1. **Backups (staging).** A Railway snapshot of the DB and of the uploads volume, plus an off-platform encrypted `pg_dump -Fc` and an uploads `tar.gz` (runbook §2).
2. **Restore drill on that real dump.** Run `scripts/release-restore-drill.sh <dump> <uploads.tar.gz>` locally, with `ROLLBACK_REF` set to the deployed staging commit. Accept only exit 0: counts and payment total unchanged, everything still `QUOTE`, rollback check = 2, 0 missing files (runbook §3). **CI's synthetic drill is not this evidence.**
3. **Backend on Railway staging** (`adaptable-quietude`). Migrations run on start. This path is roll-forward only; see `docs/admin-remediation-release.md` and runbook §6.
4. **Smoke on staging:**
   - `/api/health`;
   - CORS from the site and the app origins;
   - staff login with CSRF;
   - one QUOTE request, plus one FIXED request on a test item only;
   - receipt upload → `UNDER_REVIEW`;
   - staff confirm.

   Record the response times.
5. **Next.js site.** It needs a host. Vercel is blocked (#63); the alternative host is a separate owner decision.
6. **Android app.** A release APK signed with the release key (`docs/ANDROID-RELEASE.md`), tested on a real device first. Distribution is a separate approval.
7. **Pricing.** Switch any item to FIXED only after the installed-app compatibility and device tests (`CLAUDE.md`).

## 3. Blockers

| # | Blocker | Owner action needed |
|---|---|---|
| B1 | No real staging backup and restore drill yet | Take the backups and run the drill (§2 steps 1–2); the result goes in `TASKS.md` |
| B2 | No real Android device test (RTL, biometrics or inactivity lock, camera passport scan, slow network) | Run the device cases from the matrix below |
| B3 | Website host: Vercel account blocked | Choose and approve a host |
| B4 | Airline providers: no agreement or credentials (#109) | Everything stays request-only (`docs/FLIGHT_PROVIDERS.md`); not a launch blocker as long as no screen promises instant booking |
| B5 | Phase 2 features #105–#108 (Codex) not integrated yet | Integrate them, then re-run the full plan on the combined SHA |
| B6 | `main` carries two workflow commits not in the release line | Merge them into the release line before the release PR |
| B7 | Agency prices, legal pages and brand details need owner-approved source data | Provide them (#105, #107) |

## 4. Acceptance matrix (#110)

The matrix is filled in on the **final combined SHA** after #105–#109. Status today is on `ba05b6c`:
- **PASS** means an automated test passed in CI and locally;
- **NOT TESTED** means no evidence yet;
- **BLOCKED** means it waits on an external dependency.

A green build alone is never counted as PASS.

### Journeys: service → data → documents → confirmed price → payment → review → execution → delivery

| Journey | Website | App (`mobile/www`) | Staff dashboard |
|---|---|---|---|
| Umrah (visa only / air / sea), with guarantor, several pilgrims | PASS: `umrah-payment-journey.spec.ts` | PASS: `mobile-app.spec.ts`, `service-journeys.spec.ts` | PASS: same specs (confirm, execution, delivery) |
| Egypt security approval (air / land) | PASS: `egypt-passport-upload.spec.ts`, `platform3.spec.ts` security lifecycle | PASS: `service-journeys.spec.ts` (Egypt) | PASS |
| Visa with a FIXED price → payment step | PASS: `website-fixed-price-real.spec.ts`, `website-payment-step.spec.ts` | PASS: `pricing-progress.spec.ts` | PASS: `admin-workflow.spec.ts` |
| Flights (request-only), hotels, ferries | PASS: `flight-search-issue-104.spec.ts` (search, no instant booking) | PASS: `service-journeys.spec.ts` (hotels, ferries) | PASS |
| Staff cases: filters, linked request, phone layout | — | — | PASS: `admin-cases-filters.spec.ts` |
| Passport scan → mandatory review | PASS: `passport-scan-review.spec.ts` (synthetic images) | NOT TESTED (the app has no scan) | PASS: OCR mismatch / duplicate warnings (`caseIntelligence.test.js`) |

### Cross-cutting

| Check | Status | Evidence |
|---|---|---|
| API permissions per role | PASS | `rbacMatrix.test.js` (every mounted route against `fixtures/rbac-baseline.json`) |
| Currency separation (amount, accounts and receipt in the item's currency) | PASS | `contactRequestPricingCurrency.test.js`, `paymentSettlement.test.js`, `umrahPackageTypes.test.js` |
| Idempotency (same `submissionKey` gives the same request; double click) | PASS | `umrahPackageTypes.test.js`, `payment-recovery.spec.ts`, `umrah-payment-journey.spec.ts` |
| Price changed → 409, nothing created | PASS | `pricingModes*.test.js`, `umrahPackageTypes.test.js` |
| Receipt rejected → reason shown → new receipt | PASS | `paymentAccess.test.js`, `payment-recovery.spec.ts` |
| Payment link expired or replaced | PASS | `paymentAccess.test.js` |
| Invalid or oversized file | PASS | `contactRequestDocuments.test.js`, `flightBookings.test.js`, `passportOcr.test.js` |
| Draft resume | PASS | `intakeDrafts.test.js`; website and app resume in `website-fixed-price*.spec.ts` and `service-journeys.spec.ts` |
| Lost reply on submit or receipt | PASS | `payment-recovery.spec.ts` |
| Backend down / sustained outage | NOT TESTED | no test stops the server; to add on the final SHA |
| Privacy: tenant and customer isolation, passport text not logged, no cross-draft leak | PASS | `contactRequestTracking.test.js`, `customerAccountCenter.test.js`, `passportOcr.test.js`, `intakeDrafts.test.js` |
| Provider calls: timeout, 429, expired fare, no credential or passenger leak | PASS (mock provider only) | `flightProviders.test.js`; real providers BLOCKED (B4) |
| RTL layout, no horizontal overflow at 360 px | PASS (browser) | `assertNoHorizontalOverflow` in the specs; `admin-cases-filters.spec.ts` |
| Keyboard / screen reader / reduced motion | NOT TESTED | partial: `MotionConfig reducedMotion="user"`; needs a manual pass |
| Slow mobile network / performance | NOT TESTED | needs a throttled device run (B2) |
| Real Android device: RTL, biometrics, inactivity lock, camera upload | NOT TESTED | B2 |
| Staging: API, CORS, real backup and restore | BLOCKED | B1, owner approval |

## 5. After release: monitoring and recovery
- **Watch for the first 72 h:**
  - 5xx rate and p95 latency on `/api/contact-requests`, `/payment-access/receipt`, `/intake-drafts`;
  - 429 counts;
  - OCR queue rejections (`OCR_BUSY`);
  - failed logins and CSRF rejections;
  - the count of requests in `UNDER_REVIEW` for more than 24 h;
  - Railway volume usage, which must stay under 50% for manual backups.
- **Migration failure:** roll forward with a fix. Never roll back to the old app (rollback check exit 2). Follow runbook §6 and `docs/admin-remediation-release.md`.
- **Record each release SHA with its CI links in `TASKS.md`.**
