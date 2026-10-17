# Nasaem Platform — Release Tasks

All critical automated suites pass on `claude/release-integration`; release is stopped at the approval gate (merge, staging, deployment).

Single source of truth for release progress. Only results of runs actually executed are recorded here; anything not run is listed as not run.

Integration branch: `claude/release-integration` = PR #87 (`claude/busy-hamilton-1ccxm1`) + PR #88 + PR #89 + the fix below. Not merged into `main`; nothing deployed.

## Issue #98 — homepage service selection (2026-10-17)

| Item | Status | Evidence |
|---|---|---|
| One mobile-first homepage chooser for Umrah, security approval, visas, flights, ferries, hotels and offers; no duplicate service/package sections | VERIFIED | `BookingSearchWidget`; homepage keeps one `#start-request`; Playwright Android-width/RTL/no-overflow check |
| Selected type shows the backend catalog price and public required documents; an unpublished FIXED price is never guessed and disables booking | VERIFIED | Browser fetches `/services/public`, `/services/public/packages` and the selected requirements endpoint; mocked API acceptance test covers `1,250 SAR`, per-traveler pricing, passport requirement and unavailable FIXED pricing |
| Direct guest start; existing dedicated service routes reused | VERIFIED | Family visit, Egypt security approval and ferry link assertions; guest copy shown; no registration gate added |

Local results: web typecheck ✅, ESLint ✅, production build ✅ (`NODE_ENV=production`), targeted homepage Playwright **6/6**. Full CI and deployment NOT TESTED; no merge or deployment performed.

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

## Egypt variants: bookable only at a published fixed price; website chooser (2026-10-12, `b280a95`)

| Item | Status | Evidence |
|---|---|---|
| Website variant chooser before traveler details and documents | DONE | `web/src/components/sections/egypt-clearance-booking.tsx` + `egypt-security-approval/page.tsx` (catalog not cached): both cards, each with its configured price; the form (traveler, passport) mounts only after choosing; the original item's single price is no longer shown |
| Only an active FIXED-priced variant can be booked; otherwise «غير متاحة للحجز حاليًا»; no quote fallback, no legacy routing | DONE | Server `egyptVariantBookingError`: inactive/QUOTE/unpriced → 409 `EGYPT_VARIANT_UNAVAILABLE`; no confirmed total → 400 `FIXED_TOTAL_REQUIRED` (both `/contact-requests` and draft submit). App and website list both variants; unconfigured ones disabled with «غير متاحة للحجز حاليًا», no form, no fallback to `VISA-EGYPT-CLEARANCE`. Existing orders untouched (no data change); old APKs still post to the original item, which the server keeps accepting (preserves their in-flight bookings) |
| Flow: variant + price → travelers/documents → confirm total once → payment (account details + receipt) → no quote approval | VERIFIED | App: `mobile-app.spec.ts` «Egypt variants» (both) + `service-journeys.spec.ts` Egypt journey now on the fixed air variant (no staff quote, no approve button, receipt → under review → accepted → execution → delivery → travel plan). Website: `egypt-passport-upload.spec.ts` (both variants submitted FIXED + approved invoice + entry method stored; air → `/track` payment step with account details, copy, receipt → `UNDER_REVIEW`; price changed after display → 409, new total shown, re-confirmed) |
| Unconfigured catalog tested | VERIFIED | Backend `egyptClearanceVariants.test.js` (inactive / QUOTE / no total refused, nothing created; hidden from catalog); app «Egypt, unconfigured catalog»; website «unconfigured catalog»; mobile unit `egypt-view.test.mjs` |

Local results: backend Egypt/pricing/intake/workflow/progress/CSRF suites 145/145 (fresh DB); mobile unit 81/81; Playwright website Egypt 6/6 + app 10/10; web tsc/eslint ok. Service journeys + platform3 + home entry: 56/58 in the full run; the Egypt journey failed because the **app's request screen only offered the travel plan for the exact original code** (variant requests had no «بيانات السفر والتعميم» button) — fixed (app `requests.js`, website `egypt-clearance-travel-followup.tsx`, website routes for the variant codes); the Egypt journey and the one serial test that did not run then passed (1/1 + 1/1). Latest-head CI on `a4782a4` (run 38301165664): Backend tests ✅ (first attempt 1/872 failed, not reproducible locally at 872/872; the single re-run passed), Playwright E2E ✅ (incl. the Egypt journey that failed on `b0aacff`), Frontend typecheck + build ✅, PostgreSQL backup + restore drill ✅, build-apk ✅. Vercel ❌ — account blocked (not code).

## Egypt clearance (موافقة حربي) — real-device feedback (2026-10-12)

| # | Feedback | Status | Evidence / remaining gap |
|---|---|---|---|
| 1 | Variant + entry method first, each with its configured price | DONE (app) | Two visa types `VISA-EGYPT-CLEARANCE-AIR` «موافقة حربي — دخول بالطيران» and `-BORDER` «… دخول عبر المعبر», each priced in the back-office (pricing mode, price, currency, unit). The app's Egypt screen lists the published variants with their own price (fresh catalog), or «يُحدَّد السعر بعد مراجعة الطلب» when unpriced; the service-info page shows the variant prices instead of the original item's single price. **No price is invented:** `prisma/setup-egypt-clearance-variants.js` creates them INACTIVE and unpriced; without active variants the app keeps the original item. |
| 2 | Variant → travelers → documents → confirm total → payment → receipt review → processing → delivery; no quote stage for fixed price; existing orders preserved | VERIFIED | Existing fixed-price engine (server recomputes, approved invoice, no QUOTE stage); Egypt rules (travel plan, progress, completion) recognise the variants. Existing requests and the original `VISA-EGYPT-CLEARANCE` untouched (no data migration). `backend/tests/egyptClearanceVariants.test.js`: AIR and BORDER each end to end (payment → receipt «under review» → confirm → documents → execution → delivery, travel plan follows, accepted price unchanged) |
| 3 | `[object Object]` in the entry-method dropdown | FIXED | App rendered `{value,label}` options as strings (all SELECT questions). Now label shown, stable value submitted (`mobile/www/js/egypt-view.js` `selectOptions`). Server records the entry method (`intakeData.egyptEntryMode` + the answer) from the variant and refuses a contradicting (`ENTRY_MODE_MISMATCH`) or unknown value such as `[object Object]` (`ENTRY_MODE_INVALID`), on `/contact-requests` and draft submit |
| 4 | FAQ below the flow / collapsed | DONE (app) | Compact header → variant chooser with prices → form → FAQ in a collapsed «مساعدة: الأسئلة الشائعة» |
| 5 | Payment: account details, copy, image/PDF receipt together; upload = under review | VERIFIED (earlier) | Payment-step rows above; Egypt variants reuse it |

Tests: backend `egyptClearanceVariants.test.js` 5/5 (catalog prices per variant; AIR and BORDER end to end; tampered total / other variant's price / wrong currency → 409, nothing created; entry-method mismatch and `[object Object]` refused) + related suites (Egypt, pricing, intake, workflow, progress) 134/134 on a fresh DB. Mobile unit 80/80 (`egypt-view.test.mjs`). App browser `mobile-app.spec.ts` 10/10 and website Egypt + service journeys (incl. Egypt clearance) + pricing-progress 14/14 (local), incl. new «Egypt variants» (both variants priced in admin, chosen first, total confirmed, FIXED + approved invoice + entry method stored) and the dropdown regression.

**Required outside code (not done, owner):** (a) deploy this backend (no migration); (b) run `node prisma/setup-egypt-clearance-variants.js` once on the target DB (creates 2 inactive visa types + copies requirements; additive), then in الإدارة → التأشيرات set each variant's fixed price/currency and activate it; (c) a new APK. **Staging compatibility (NOT TESTED live; Railway unreachable from here):** the last recorded staging build `f2616659` has no pricing fields in the public catalog (pre-#87), so even with variants an old backend cannot price them; the new app falls back to the original item there. **Website gap:** the website Egypt page still uses the original item (its dropdown already showed labels); variant selection on the website is not implemented.

## Android staging blocker: registration refused with CSRF_REJECTED (2026-10-12)

- **Root cause (VERIFIED in code):** the app (Capacitor 8.5.3, `CapacitorHttp` enabled) sends every request through the native HTTP stack: no `Origin`, `Referer` or `Sec-Fetch-Site`, and a global native cookie jar (`CapacitorCookies`, ACCEPT_ALL) that replays any session cookie the API set (`customerAccessToken` after sign-in/registration, `trackingAccessToken` after a phone-code sign-in). With such a cookie stored, a write without a Bearer token (registration, sign-in, tracking code request) is cookie-carrying, so `csrf.middleware.js` requires provenance; with no provenance header and no `X-Requested-With` it answers 403 «تم رفض الطلب لأنه لم يصدر من صفحة موثوقة…». Same middleware on HEAD and on the build staging last ran (`f2616659`).
- **Fix (app only, CSRF unchanged):** `mobile/www/js/api.js` sends `X-Requested-With: com.nasaemalharamain.app` on every API request (fetch and the XHR upload path). This is the existing custom-header rule; an untrusted/`null` Origin, cross-site fetch metadata or a foreign Referer still win over it. `https://localhost` (the WebView page origin) is **not** trusted and need not be: the app never sends it. No wildcard, no new trusted origin, no route exemption.
- **Tests:** `backend/tests/nativeAppCsrf.test.js` (app request shape with replayed cookies registers; same request without the header → 403; header + `https://evil.example` / `null` / `https://localhost` / cross-site / foreign Referer → 403; tracking code request with/without header) + `csrfProtection.test.js`: 9/9 (fresh DB). `mobile/tests/api-headers.test.mjs` 1/1; mobile unit 77/77; app browser journeys (`mobile-app.spec.ts`, `pricing-progress.spec.ts`, Chromium, local backend) 13/13 with the header (CORS preflight ok).
- **Needed to fix staging:** a **new APK** built from this branch (installed `efa3bc7` APKs keep failing whenever a session cookie is stored). **No backend deployment and no staging configuration change** are needed for this fix. NOT TESTED on a real device or against live staging: this environment cannot reach the Railway host (proxy 403), so the deployed backend version could not be read.

## Owner requirements — status (reconciled 2026-10-12 on `claude/release-next`)

| # | Requirement | Status | Evidence / remaining gap |
|---|---|---|---|
| 1 | Fixed price: confirm the shown total once, then payment; no quote approval | VERIFIED (app, website service wizard, `/track`) | Server recomputes the total; mismatch → 409, nothing created; FIXED → approved invoice, no QUOTE stage, quote/approve refused (`pricingModes.test.js` "…with no quote stage", "a total that differs…", "payment after document review…"; `intakeDraftPricing.test.js`). App: `pricing-progress.spec.ts` fixed-price test. Website: `website-fixed-price.spec.ts` + `website-fixed-price-real.spec.ts` (real backend: reprice → 409 → re-confirm; then `/track` has no QUOTE circle, no approve button, payment amount shown). **Gap:** website hotel/ferry forms have no fixed-total step (a FIXED item there falls back to QUOTE, never charged unseen). |
| 2 | Quote-required: explicit pricing mode, version-checked approval | VERIFIED | `pricingMode` enum, default QUOTE, set in back-office/Next.js; approval needs the exact `invoiceVersion` (`QUOTE_VERSION_REQUIRED` / `QUOTE_CHANGED`, `workflow-policy.js`). Tests: `pricingModes.test.js` "the agency quotes and the customer approves the exact version", "empty-body approval refused"; `pricing-progress.spec.ts` quote-required; `admin-workflow.spec.ts` "website /track: … stale or repriced approval is refused in Arabic". |
| 3 | Interactive service-specific progress circles, accurate states | VERIFIED (app); **FIXED NOW (website `/track`)** | Website previously built its own timeline in the browser (could disagree with the server, not tappable). Now renders the server's `deriveRequestProgress` steps as an accessible tab list with status line and action button. `website-payment-step.spec.ts` (QUOTE: one current stage, tap/Home key, action focuses the approve button, after receipt PAYMENT done / PAYMENT_REVIEW current) and `website-fixed-price-real.spec.ts` (every circle equals the server's state, no QUOTE stage). App: `progress-circles.test.mjs`, `progress-view.test.mjs`, `pricing-progress.spec.ts`. |
| 4 | Payment: amount/currency, bank, holder, copyable number, image/PDF receipt together; receipt = under review | VERIFIED | See the payment-step row above (`website-payment-step.spec.ts`, `mobile-app.spec.ts`). |
| 5 | Per-traveler requirements; one complete staff request workspace | VERIFIED | Per-traveler checklist and uploads (`mobile-app.spec.ts` family visit + replaced document; Umrah pilgrims); per-traveler deliverables and delivery gate (`admin-workflow.spec.ts` "/admin/cases «سير العمل»: … per-traveler files, completion"). Next.js `/admin/cases` workspace: overview, workflow (price, receipt accept/reject, execution, publish files), travelers, documents, tasks, provider, notes, activity. Payment review also has its own queue (`/admin/payment-review`). |

Local runs for this reconciliation: website/platform3 Playwright project 55/55 (incl. `admin-workflow`, `platform3`, website pricing/payment specs); web tsc/eslint ok. CI pending on the pushed head.

## Service flow: Umrah section, Egypt approval, direct payment, admin queues (2026-10-13, branch `ccr-6f320531-vdqix0`, based on `claude/release-next`)

Not merged, nothing deployed, no live data touched. Two **additive** migrations: `20261015090000_request_payment_access` (2 nullable columns + unique index), `20261015100000_umrah_guarantor_residence` (requirement rows: Umrah personal photo **deactivated, never deleted**; «إقامة الضامن» added once where missing).

| Item | Status | Evidence |
|---|---|---|
| Unified flow: service → applicant → details → documents → summary + final price → **payment straight away** (amount, account in that currency, receipt) → submit for review → confirmation with number, request and payment status | VERIFIED (website Umrah/visa wizard, website Egypt form, app intake) | Request-scoped payment token returned on creation (`POST /contact-requests` and draft submit) for FIXED requests; stored as SHA-256 hash, 72h, opens only `GET /contact-requests/:id/payment-access` and `POST …/payment-access/receipt`. `paymentAccess.test.js` 5/5, `intakeDraftPricing.test.js`; e2e `umrah-payment-journey.spec.ts`, `egypt-passport-upload.spec.ts` (BORDER pays on the spot), `pricing-progress.spec.ts` «payment open: straight to the payment screen» |
| Receipt ≠ paid: status «بانتظار مراجعة التحويل» (`UNDER_REVIEW`); only ACCOUNTANT/ADMIN confirm; audited with amount/currency/status change; staff notification linked to the request | VERIFIED | `paymentAccess.test.js` (employee 403, accountant 200, audit row, notification `contactRequestId`) |
| Duplicate submissions | VERIFIED | Website wizard now sends one `submissionKey` per form + in-flight guard (app already did); retry returns the same request with a fresh token, old token stops working (`paymentAccess.test.js`, `website-fixed-price.spec.ts`, e2e double-click in `umrah-payment-journey.spec.ts`) |
| Umrah as its own section | VERIFIED | `/umrah` uses the intake wizard on Umrah packages (documents, final price, payment) instead of the contact-only form; Umrah visa types removed from `/visas`, homepage visa list, wizard visa list and the app's visas hub (`platform3.spec.ts`, `service-view.test.mjs`). Existing Umrah requests untouched |
| «إقامة الضامن» instead of the personal photo (Umrah only) | VERIFIED | Migration + seed; `umrahGuarantorRequirement.test.js` 6/6; checked on a DB with existing data and on a fresh DB; other packages keep their photo |
| Prices SAR + SDG, admin-managed, no default rate | VERIFIED (existing + review line) | Prices come from the catalog (admin); SDG shown only from the agency's active FX rate (`fxRateToSdg`), otherwise «غير متاح حاليًا» (`pricing-view.test.mjs`). Seed's initial Umrah package prices are dev seed values only (QUOTE until the admin sets FIXED) |
| Egypt form | VERIFIED (most was already done on `claude/release-next`: variants, `[object Object]`, entry method, FAQ) | Website form now shows a review of the data before sending and goes straight to payment |
| Admin: Umrah / Egypt queues, receipt, statuses | VERIFIED | `GET /contact-requests?serviceKind=UMRAH|EGYPT_CLEARANCE` + case-workspace filter, service and payment chips; payment-review queue links the latest receipt (`staffServiceQueues.test.js` 2/2) |

PR: **#94** (`ccr-6f320531-vdqix0` → `claude/release-next`). Owner approval covers opening the PR, verifying and fixing only — no merge, no deploy, no live data.

Follow-up on owner review (2026-10-13):

| Item | Status | Evidence |
|---|---|---|
| Payment token security | VERIFIED | Scoped to one request (another request's token → 404); expires (72h, expired → 404 `PAYMENT_ACCESS_INVALID`, nothing changes); header only (query string refused); hash never returned. Cannot confirm/reject a payment, open the staff detail, document files or tracking routes (all 401, as header or as Bearer). Summary exposes payment facts only (no documents, travelers, phone, passport, file names). Receipt upload: file required, type checked (text → 400), refused once under review/confirmed (409) and on a closed request; only ACCOUNTANT/ADMIN confirm. `paymentAccess.test.js` 9/9 |
| Refresh during payment: no duplicate, clear way to finish | VERIFIED (fixed a real gap) | Website: after a submit the server-draft token was still stored, so a refresh offered «متابعة الطلب» and could resend the request → now dropped; the pending payment is kept per tab and a refresh returns to the payment step («طلبك محفوظ مسبقًا ولن يُرسل مرة أخرى»), same for the Egypt form. App: pending payment kept on the device, home screen card «طلب بانتظار الدفع» until finished or expired. e2e: `umrah-payment-journey.spec.ts` (reload → resumed, still 1 request), `pricing-progress.spec.ts` (reload app → resume → receipt, 1 request); unit `experience-core.test.mjs` |
| New Umrah packages inherit «إقامة الضامن» | VERIFIED | Created (or moved into an Umrah category) in the same transaction; other services untouched; a deactivated one is not re-added. `umrahGuarantorRequirement.test.js` 9/9 |
| Migrations on a DB with old requests and documents | VERIFIED (local) | DB built with the base code `eee34d1` (migrations + seed) + Umrah/family requests whose documents point at the photo requirement, receipts, invoices. After this branch's migrations: requests 5, documents 15, travelers 5, invoices 2 identical field by field; no requirement deleted; 0 dangling document→requirement links (3 documents still linked to the now-inactive photo requirement); staff API: every old request 200, every file downloaded (15/15), Umrah queue lists them; token hash never returned. `scripts/release-restore-drill.sh` on a dump of that data + uploads archive: verdict pass (counts/payment total unchanged, 0 missing files, rollback-check to `eee34d1` exit 2 = roll-forward only, as designed) |

Local results on `23e96be` (disposable PostgreSQL 16): backend full **891/891**; mobile unit **84/84**; Playwright, all four CI projects in one run (`mobile-web`, `mobile-frontend`, `platform3`, `mobile-app`) **96/96** — includes the «homepage Services grid: Family Visit card» test that failed once earlier (73/74), now green in the full run; web tsc/eslint ok.

GitHub Actions (PR #94):
- `23e96be` and `b81ec67`: Backend ✅, Frontend ✅, backup/restore drill ✅, build-apk ✅, **Playwright ❌ 95/96** — the new `umrah-payment-journey.spec.ts` used a non-exact heading locator («اختر الباقة» also matched the page h1 «اختر الباقة وأرسل طلبك»; strict-mode violation in CI, passed locally only because the h1 rendered alone first). Fixed in `3cd1a01` (exact locators, also for «تم استلام طلبك»).
- **`3cd1a01`: Backend tests ✅, Frontend typecheck + build ✅, Playwright E2E ✅, PostgreSQL backup + restore drill ✅, build-apk ✅.** Vercel ❌ «Account is blocked» (account issue, not code; same on #91/#92).

NOT TESTED: real Android device, live staging/production (no access, no approval). (The earlier gaps — reload during the website payment step, new Umrah packages without «إقامة الضامن» — are fixed above.)

## Registration signs the customer in straight away (2026-10-13, `claude/release-next`, PR #92 merged into `claude/release-integration` as `4c32651`)

| Item | Status | Evidence |
|---|---|---|
| Root cause | VERIFIED | Website (`nasaem-alharamain.com`) and API (`*.up.railway.app`) are different sites, so the `customerAccessToken` cookie is third-party and often blocked: registration succeeded but the account page then got 401 and asked to sign in. Reproduced in e2e by stripping `Set-Cookie`; fails without the fix |
| Website | VERIFIED | Token from register/login kept in `localStorage` (`customer-session.ts`, `exp` checked) and sent as `Authorization: Bearer`; 401 forgets it and returns to login with «انتهت جلستك…»; existing phone (409) offers sign-in with the number prefilled; network loss shows a clear message; double clicks send one request; logout revokes and clears. No OTP exists on registration today — nothing bypassed. `account-registration.spec.ts` 3/3 |
| App | VERIFIED | `startSession` stores the token and loads the customer, goes to the account; existing phone routes to sign-in prefilled. `mobile-app.spec.ts` registration test |
| Backend | VERIFIED | Token-only session from the website Origin works for profile/logout; logout revokes; duplicate phone 409 returns no data. `customerRegistrationSession.test.js` 2/2 |
| CI on `1384019` | VERIFIED | Backend, Frontend, Playwright, backup/restore, build-apk ✅; Vercel ❌ account blocked |

## PR #94 merged with `claude/release-next` (2026-10-13, merge `b37ccee`)

Owner chose: include PR #94 in `claude/release-next` before opening `claude/release-next` → `claude/release-integration`. Only conflict: `web/playwright.config.ts` `testMatch` (kept both `account-registration` and `umrah-payment-journey`). No new migrations from `release-next`; with PR #94 the release carries **13** additive migrations vs `main` (11 + `20261015090000_request_payment_access`, `20261015100000_umrah_guarantor_residence`).

Local on `b37ccee` (fresh PostgreSQL, migrate + seed as CI): backend **893/893**; mobile unit **84/84** + syntax check; web tsc/eslint ok; `next build` ok; Playwright, all four CI projects in one run, **100/100**.

Production gate NOT passed: no production backup yet (owner, 2026-10-13), production branch/Vercel project not verified, Vercel account blocked. No merge into `main`, no deploy, no DB change, no Android distribution.

## Epic #96 — Issue #99 Umrah: three package types, guarantor contacts, direct payment (2026-10-17, branch `claude/umrah-packages-99`, base `claude/release-integration` `821df72`)

Not merged, nothing deployed, no live data touched. **No migration**: the package type is a `KIND: VISA_ONLY|AIR|SEA` entry in `Service.features`, next to the existing `INCLUDED:`/`EXCLUDED:` lines.

| Requirement | Status | Evidence |
|---|---|---|
| 3 types: visa only / flight services / sea services | VERIFIED (local) | `prisma/setup-umrah-packages.js` (idempotent, called by the seed): sets `KIND: VISA_ONLY` on `SVC-UMRAH-VISA` only if it has no type; creates `SVC-UMRAH-AIR` and `SVC-UMRAH-SEA` **inactive, QUOTE, price 0** (no invented price) with the visa-only checklist + «إقامة الضامن». Other packages and requests untouched. Admin «نوع الباقة» select (`umrah-package-manager.tsx`) |
| Real price per type, SAR + SDG from the active agency rate only | VERIFIED (local) | Package card on `/umrah` (wizard select step), app Umrah screen and homepage cards: a FIXED package shows «السعر: 1,250 SAR للمعتمر» (not «يبدأ من»); SDG only from `priceSdg` (active FX rate), otherwise «المقابل بالجنيه السوداني غير متاح حاليًا». Homepage: coordinated with Codex PR #111 (#98) — it removes `FeaturedUmrah` (which said «التكلفة النهائية يحددها الموظف» / «يبدأ من») from the homepage and shows a FIXED price, «غير متاح للحجز» for an unpriced FIXED item and «بعد مراجعة الطلب» for a quoted one; this branch does not touch homepage files |
| Short texts, included / not included | VERIFIED (local) | Card shows type badge + «يشمل: …» / «لا يشمل: …» from the package's own lines |
| Applicant + every pilgrim's passport + guarantor residence + **guarantor phone required** + optional extra contact | VERIFIED (local) | The website wizard and app form require the guarantor phone before submitting. Server (`umrah/umrah-packages.js` `resolveUmrahContacts`, `POST /contact-requests` and draft submit, Umrah service/package only, not a visa type): an invalid guarantor or extra-contact phone is refused before anything is created (400 `GUARANTOR_PHONE_INVALID` / `EXTRA_CONTACT_PHONE_INVALID`); a **missing** one is accepted and flagged `guarantorPhoneMissing` (older installed apps cannot send it), shown to staff in `/admin/cases` as «رقم هاتف الضامن لم يُرسل — اطلبه من العميل». Stored as `intakeData.umrahContacts`; shown on the review step |
| Review → account in the right currency → PDF/image receipt → `UNDER_REVIEW` until finance confirms | VERIFIED (existing flow, re-tested per type) | `umrahPackageTypes.test.js` and e2e: amount = fixed total, accounts only in SAR, receipt → `UNDER_REVIEW`, employee 403 on confirm, accountant confirms |
| Execution «جارٍ إصدار التأشيرة» / «جارٍ إصدار التذاكر», then delivery | VERIFIED (local) | `request-progress.js`: Umrah visa only → «جارٍ إصدار التأشيرة», delivery «تسليم التأشيرة»; AIR/SEA → «جارٍ إصدار التذاكر», «تسليم التأشيرة والتذاكر» (same label for staff, tracking and app) |
| No «price decided later» on FIXED packages; server price can't be bypassed | VERIFIED | Existing `resolveSubmissionPricing` (409 `PRICE_CHANGED` re-tested with 2 pilgrims at one pilgrim's price; nothing created) |
| 3 E2E scenarios package → delivery; several pilgrims; guarantor; 409; no duplicate; receipt review | VERIFIED (local) | Playwright `umrah-payment-journey.spec.ts` 3/3 (VISA_ONLY, AIR, SEA: card type/price/inclusions, «التالي» disabled until the guarantor phone, 2 pilgrims, 3 documents, review shows the guarantor, double-click + reload = 1 request, payment, receipt `UNDER_REVIEW`, staff confirm, execution label, per-pilgrim delivery → `CLOSED/COMPLETED`). Backend `umrahPackageTypes.test.js` 7/7 (seed types, contact rules, refusals create nothing, draft route, 3 journeys incl. retry with the same `submissionKey` → same request) |

Other results (local, fresh DB): backend full suite 891/892 before the one expected fix (`contactRequestIntake` submitted an Umrah request without a guarantor phone → test updated), then the affected suites 39/39; mobile unit 87/87 (`umrah-view.test.mjs` new); web `tsc`/`eslint` clean. Browser suites touching Umrah/intake: see the PR.

Compatibility: an **installed app older than this branch** keeps submitting Umrah requests exactly as before (no new required field server-side; fixed price, payment token and receipt unchanged), verified by `umrahPackageTypes.test.js` «an older app without the guarantor field still submits» and the unmodified `contactRequestIntake.test.js` Umrah submission. NOT TESTED: real Android device, staging/production.

Activation (owner): deploy after approval → `node prisma/setup-umrah-packages.js` on the target DB → in الإدارة → العمرة set each package's FIXED price/currency, check «يشمل/لا يشمل» and requirements, then publish; decide whether the older `SVC-UMRAH-SERVICES` / `SVC-UMRAH-GROUP` stay published.

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
| Payment step (website `/track` + app): amount and currency, the agency's account for that currency (bank, account holder, account number and IBAN with copy buttons) and an image/PDF receipt field shown together; a receipt makes the payment «قيد المراجعة» (`UNDER_REVIEW`), never paid, until staff confirm; a rejected receipt shows the reason and asks for a new one. «تم تحويل المبلغ» stays as the no-receipt fallback | Real backend: `web/e2e/website-payment-step.spec.ts` 1/1 (copy verified via clipboard; server `paymentStatus` = `UNDER_REVIEW`); `mobile-app.spec.ts` payment test extended (amount, bank, holder, copy button, receipt field in one panel) 9/9; `platform3` Security approvals 1/1; mobile unit 74/74; web tsc/eslint ok. Other journeys using the payment step: `service-journeys` (flights, ferries, hotels, Umrah, family visit) 5/5 + `pricing-progress` 4/4 local; `admin-workflow` 3/3 local (first attempt aborted at `page.goto('/admin/cases')`, a page this change does not touch; passed on rerun with clean ports) |
| Android release workflow: `version_name` validated (`X.Y.Z`) and passed via env (was interpolated into shell/node); device checklist includes the QUOTE/FIXED checks | `android-release.yml`, `docs/ANDROID-RELEASE.md` — NOT RUN (owner-triggered, needs signing secrets) |
| Flights/hotels/ferries readiness: website and app wording reviewed — flight results are agency-entered, hotels/ferries are requests whose availability and price staff confirm; no instant-booking claims | grep review; no code change needed |

**GitHub Actions on `3328e17` (PR #92)**: Backend tests ✅, Frontend typecheck + build ✅, Playwright E2E (full suite, incl. `website-fixed-price.spec.ts`) ✅, PostgreSQL backup + restore drill ✅. The local full Playwright run did not finish (session time limit); CI is the evidence.

BLOCKED: `nasaem-website-change-plan.md` (named by the owner as the implementation reference) is not in either repository (any branch) nor findable in Google Drive; only the requirements stated directly by the owner were implemented against it.

Remaining known gaps (not blockers while every service is QUOTE): hotel and ferry forms have no fixed-total step (a FIXED item there falls back to QUOTE, never charged unseen). FIXED stays disabled until the new Android app is distributed and checked on a real device.
