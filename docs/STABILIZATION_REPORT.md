# Stabilization report — `stabilize/production-readiness`

Baseline: `codex/nasaem-mobile-v2` @ `853c4ea` (a strict superset of `main`; 571/571 backend tests green locally). Branch = baseline + 14 reviewed commits (`853c4ea..HEAD`). Nothing has been deployed, no production data has been touched, no branch was merged or deleted.

Statuses: **FIXED** · **PARTIAL** · **BLOCKED** · **NOT STARTED**. Verification classes: CONFIRMED · PARTIALLY CONFIRMED · NOT REPRODUCIBLE · NEEDS INFRASTRUCTURE ACCESS.

Related documents: `PR_DISPOSITION.md` (baseline + PR table), `FINANCIAL_MODEL.md`, `ARCHITECTURE_CONSOLIDATION_PLAN.md`, `mobile/README.md`.

## Final verification (CI-equivalent, fresh database)

| Gate | Result |
|---|---|
| Backend lint (new) | PASS |
| Backend tests (`npm test`, clean `npm ci`, all 52 migrations from scratch, seed) | **654 / 654 PASS** |
| Backup → restore drill (52 migrations, users, services verified) | PASS |
| Web lint / typecheck / production build | PASS / PASS / PASS |
| Mobile lint / typecheck / unit tests | PASS / PASS / 18 of 18 |
| Mobile Android JS bundle (`expo export`) | PASS (2.83 MB Hermes) |
| Playwright E2E (3 projects, 64 tests) | see "Phase 5" below |
| Mobile Android Gradle build + APK signature | **NOT VERIFIED** — needs the Android SDK and GitHub secrets; first CI run must confirm |

---

## Critical fixes (in the agreed order)

### 1. Customer account takeover through registration — FIXED
**Finding.** Anyone who knew a customer's phone could claim that customer's record and portal.
**Verification (CONFIRMED).** `customerRegistrationOwnership.test.js` "EXPLOIT": `POST /api/customer-auth/register` with only a staff-created customer's phone returned **201** and a session cookie.
**Root cause.** `registerCustomer` attached a password to *any* existing `Customer` found by phone with no ownership proof; a brand-new unverified phone could also be squatted.
**Fix.** OTP required for every registration. New `PhoneVerification` table (additive): HMAC-hashed, purpose-bound, 10-min TTL, single-use (atomic), burned after 5 wrong guesses, 3 codes/phone/15 min + per-IP limiter. Existing records link only after verification; staff-recorded names are not overwritten; several unclaimed records for one phone are refused (409); `+249`/`0…` variants match. Web form has the code step.
**Tests.** `customerRegistrationOwnership.test.js` (10) + customer-auth suites moved to the two-step flow.
**Files.** `prisma/schema.prisma`, `…/20261005090000_add_phone_verification`, `utils/phoneVerification.js`, `modules/customer-auth/*`, web `account-auth-card.tsx`.
**Commit.** `99b377c`

### 2. CSRF on cookie-authenticated mutations — FIXED
**Verification (CONFIRMED).** A cross-site urlencoded `<form>` POST to `POST /api/users` **created a SUPER_ADMIN (201)**.
**Root cause.** Cookies are `SameSite=None` in production (cross-site Vercel → Railway); CORS does not stop a simple form POST; `express.urlencoded` parsed it.
**Fix.** `csrfGuard`: a non-GET request with a session cookie needs an `Origin` on the `CORS_ORIGIN` allow-list or the API's own host (else `Sec-Fetch-Site` same-origin/none). Bearer clients (mobile), anonymous requests and non-browser clients are unaffected. `express.urlencoded` removed. `SameSite` left at `None` (infrastructure decision: one registrable domain would allow `Lax`).
**Tests.** `csrfProtection.test.js` (12). **Files.** `middleware/csrf.middleware.js`, `app.js`. **Commit.** `896a32e`

### 3 + 4. Currency-unsafe payments and reports — FIXED
**Verification (CONFIRMED).** USD payment on a SAR order accepted with no rate; SDG+USD+SAR payments flipped a 1,000 SAR order to PAID; the report returned one mixed-currency `totals`.
**Root cause.** Payment status ignored `currency`; reports/dashboard summed across currencies with JS floats; refunds were ignored rather than subtracted.
**Fix.** See `FINANCIAL_MODEL.md`: orders settle in one currency; every payment stores `fxRate` + `convertedAmount` (Decimal, half-up); cross-currency requires a rate; net-of-refunds position (`paidAmount`, `balanceDue`, `overpaidAmount`); per-currency Decimal-exact reports and dashboard; staff payment form has currency + rate. Legacy mixed-currency rows are left NULL and listed by the read-only `npm run finance:audit` — **no production data migrated** until finance reviews that list.
**Tests.** `currencySafeFinance.test.js` (10). **Commit.** `80f8605`

### 5 + 6 (+ N1–N3). Public flight booking — FIXED (two behaviour changes need owner sign-off)
**Verification (CONFIRMED).** A 1,500,000 SDG flight booked for **1 SDG**; unknown flight ids accepted; a victim's `customerId`/`passportNo` bound the booking and the response disclosed their name/phone/email; booking number + phone → HTTP 200; 30/30 guesses and 14/14 creates unthrottled; `.txt` accepted as a ticket.
**Fix.** Server-side pricing from inventory (`price_sdg × passengers`); a public booking always gets a new customer; per-booking access token (SHA-256 stored) or a phone-verified session; limiters (create 10, upload 10, *failed* lookups 20 per 15 min/IP); shared magic-byte validation, server-generated names, 10 MB/413; path-only access logs; web booking page uses token / OTP.
**Needs owner decision.** (a) Multi-passenger bookings are now priced per passenger (the UI says "per person" but billed one). (b) Live-provider (TRIP) fares cannot be booked online (no stored quote).
**Tests.** `flightBookingSecurity` (14), `flightBookingRateLimit` (2), `accessLog` (2). **Commit.** `482cab9`

### 7. Passport OCR memory/CPU — FIXED
**Verification (PARTIALLY CONFIRMED; real OOM point = NEEDS INFRASTRUCTURE ACCESS).** 12 MP JPEG: 389 MB / 79 s; 48 MP (9.8 MB file): did not finish in 170 s. OCR is reachable from **public** upload paths.
**Fix.** Header-based pixel cap (64 MP), `sharp` downscale to a 2000 px long edge, one job at a time (≤3 waiting, rest 503), 60 s timeout. PR #66's OCR commit was **ported**, not merged. After: 12 MP 272 MB / 24 s; 48 MP 258 MB / 26 s.
**Tests.** `ocrResourceLimits.test.js` (9). **Commit.** `9b1bd1c`

---

## Phases 5–7

### Phase 5 — CI reliability
* **E2E (CONFIRMED red, root-caused).** Reproduced locally with a CI-identical setup: **58 passed / 6 failed**. None was an app regression — each asserted UI that was deliberately restructured: Operations filters moved behind a toggle (1); homepage grid capped at 6 while the full catalog is `/services` (4); `/umrah` became a package picker (1). Assertions updated, nothing skipped or weakened; all 6 then pass. **Commit** `e50729b`.
* **Flaky test (CONFIRMED).** `smartCaseAssignment` counted every notification in the shared DB; fixed at its root. **Commit** `3031785`.
* **Lint (FIXED).** Backend had no linter: added ESLint (recommended rules, 12 unused-variable findings, no bugs) — `0ce6e4c`. `ci.yml`: backend + web lint, `npm ci`, job timeouts, concurrency, push trigger limited to `main` — `1ced8de`. Mobile lint/typecheck/tests run in its workflow.
* **Open:** the Android workflow's Gradle/signing steps are unverified (see above).

### Phase 6 — Mobile (FIXED except the unverified build)
Flight search always failed (date regex written `\\d`; confirmed in Node) → tested validator; no way to open issued visas/tickets → authenticated download + share; no logout / expired session handling → account screen + 401 handling; offline looked like "logged out" → retryable error; uploads unchecked on-device → one validator for 7 pickers; clear Arabic network/server errors; contact + legal links; legacy staff screens and staff-token code removed. 18 unit tests. **Commit** `de36808`.
Environment separation (dev/staging/production packages and APIs, production refuses staging/localhost), a real release-signing plugin (verified against the generated Gradle), the launcher icon moved into the app folder, workflow that fails a production build without release secrets and verifies the APK signature. **Commit** `e15e5d6`.

### Phase 7 — Admin operational readiness
| Item | Status |
|---|---|
| Server-side search (name, phone any format, passport, case id) + filters + real pagination | **FIXED** `a548b50` (10 tests) |
| Staff password change / reset | **FIXED** `dfa7ca6` (+ session revocation, per-account lockout, token-scope check) |
| Users module organisation-scoped; ADMIN could suspend a SUPER_ADMIN | **FIXED** `dfa7ca6` (found while implementing) |
| Order outstanding balance and payment history | **FIXED** for orders (`paidAmount`/`balanceDue` + list in the staff order view) |
| Case (ContactRequest) balance / partial payments / history | **NOT STARTED** — needs the unified ledger (`ARCHITECTURE_CONSOLIDATION_PLAN.md` §3) |
| Internal notes, status history, employee audit, documents | **Exist** (case notes with author; timeline built from the activity log; document review). A real `CaseStatusHistory` table and a human case number are planned (§2). |
| OTP flooding / silent "code sent" with no WhatsApp | **FIXED** `90af030` (per-phone throttle, 503 when no channel) |

---

## Release blockers still open (public release)
1. **Legal pages** (terms, privacy, refund, cancellation, payment info) are placeholders — needs owner/legal text.
2. **Owner decisions:** per-passenger flight pricing; TRIP fares not bookable online.
3. **Finance review** of the `finance:audit` list before any legacy payment is converted.
4. **Infrastructure proof:** Railway upload volume, memory limit, backups/restore, env variables, health check; `JWT_SECRET`/WhatsApp token rotation as a precaution.
5. **Android:** first CI run of the new workflow (staging, then production with real secrets), installed on a device.
6. **Cases still lack payments/balance** (ledger work) — acceptable only if staff keep recording case payments outside the system.
7. A **staging** environment with its own database for a pilot (Render/Railway definitions currently diverge).

## Not done on purpose
No cosmetic UI work, no new business features, no destructive migrations, no renames, no branch deletion, no merge. Phase 8 is an evaluation document only.
