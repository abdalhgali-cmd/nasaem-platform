# Mobile App Rebuild — Phase 1 Audit (2026-11-22)

Read-only audit. No application code was changed. Base: `main` @ `2c40487` (merge of #208).

Legend: **VERIFIED** = checked in code or by a command run in this session. **REPORTED** = taken from repo docs / CI history, not re-run here. **ASSUMPTION** = not verified.

---

## 1. Current technical architecture

| Layer | What exists | Evidence |
|---|---|---|
| Backend | Node.js + Express + Prisma, PostgreSQL 18 on Railway (`spirited-luck`). 50 modules under `backend/src/modules`, 53 Prisma models, 75 migrations, 196 test files (node:test + supertest on a real PG). | VERIFIED (file counts) |
| Website + staff admin | Next.js 16.4.6 in `web/` — customer website and unified admin at `/admin` (Operations Center, Egypt/Umrah workspaces, embedded legacy tools). Playwright E2E (~40 specs). | VERIFIED (files); version REPORTED |
| Mobile | Capacitor 8 Android shell (`com.nasaemalharamain.app`) around a **no-build vanilla-JS ES-module app** in `mobile/www`: 56 JS files (~8.5k lines), 3 CSS files (~1.4k lines), custom router, inline SVG icon set, bundled Cairo font. | VERIFIED |
| Native code | `SecureSessionPlugin.java` (AES-256-GCM, Android Keystore, BiometricPrompt + CryptoObject), `GoogleIdentityPlugin.java`, `MainActivity.java`. | VERIFIED (files) |
| Networking | `CapacitorHttp` (native) → Bearer token; CORS does not apply to the app. API base URL lives only in `www/js/config.js` (currently QA server, `environment: "staging"`). | VERIFIED |
| CI/CD | `ci.yml` (backend, web typecheck/build, Playwright, PG backup+restore drill), `android-apk.yml` (QA APK, QA key, optional QA pre-release with direct link), `android-release.yml` (production signing from secrets), read-only smoke for staging/production. | VERIFIED (files) |
| CI state | `main` @ `2c40487`: CI run 44825903327 success; Android QA APK runs 209/210 success; QA pre-release `qa-v0.3.210` published 2026-11-21. | VERIFIED via GitHub API (download link not re-tested) |
| Mobile tests | `npm test` → **154/154 pass**; `npm run check` → 56 files syntax-clean. | VERIFIED (run now) |

Second repo `nasaem-platform-professional` is an older copy (has the legacy `frontend/` layout, no `mobile/`). **ASSUMPTION:** it is not the source of truth — needs confirmation (decision D9).

---

## 2. Existing functionality assessment (mobile)

| Area | State | Notes |
|---|---|---|
| Guest-first launch, onboarding (3 slides, once) | Implemented, unit-tested | `experience-core.js`, `onboarding.js` |
| Tabs | 4 tabs: الرئيسية · ابدأ طلب · متابعة · المزيد | Notifications/Profile live under «المزيد» |
| Services offered | Backend scope `APPROVED_INTAKE_SCOPE` = UMRAH, EGYPT_CLEARANCE, FLIGHT, FERRY, FAMILY_VISIT, VISA, GENERAL. Hotels screen exists but is **postponed by owner decision (2026-11-11)**. | VERIFIED `service-scope/intake-scope.js` |
| Umrah | Packages from `/services/public/packages`, intake per pilgrim + guarantor, «رحلتي إلى الحرمين» 7-stage journey, visa/ticket downloads. | Code VERIFIED; E2E REPORTED |
| Egyptian security approval | Air/land variants, per-traveler passport, travel plan/flight, receipt flow. | Code VERIFIED; E2E REPORTED |
| Flights | Search (`/flights/search`) over agency inventory/provider → **booking request only**, no ticket issued. Copy already says so. | VERIFIED |
| Requests submission | `POST /contact-requests` with idempotent `submissionKey`; intake drafts (save/resume) exist on backend. | VERIFIED |
| Tracking | Signed-in: `/customer/requests`; guest: phone → WhatsApp code → `/tracking/*`. | VERIFIED |
| Payments | **Bank transfer + receipt upload, staff review** (approve/reject with reason). Price approval/rejection of invoices, offer selection. No online card gateway. | VERIFIED (no gateway code found) |
| Notifications | **In-app list only** (`/customer/notifications`, mark read). **No push notifications** (no FCM/plugin). | VERIFIED |
| Auth | Password register/login, Google sign-in, password reset by WhatsApp code, optional biometric unlock, 5-min inactivity lock, weekly token refresh, server-revoked logout. **No WhatsApp-OTP account login** — OTP only powers guest tracking and reset. | VERIFIED (`customer-auth.routes.js`, `session-core.js`) |
| Profile | Edit profile, change password, my documents, security, about, legal, replay onboarding. | VERIFIED |

### Broken / blocked in real environments (REPORTED in `docs/platform-readiness/LAUNCH-STATUS-2026-11-20.md`)
1. **WhatsApp OTP not configured anywhere** → guest tracking and password reset do not work for real customers today (`OTP_CHANNEL_UNAVAILABLE`). This is the single largest UX gap and no UI redesign fixes it.
2. No production-signed Android build (signing secrets + `ANDROID_RELEASE_CERT_SHA256` missing).
3. Production prices are test data; only one package published; `PRICES_APPROVED` not set.
4. Google sign-in on Android needs an Android OAuth client per signing key (unverified).
5. No real-device test has ever been recorded (`docs/release/ANDROID-DEVICE-TEST-ar.md` — 20-item checklist, all untested).

---

## 3. Components to preserve (do not rewrite)

- **Entire backend, schema, migrations, API contracts** — the app stays a client of the existing API. No parallel backend.
- `SecureSessionPlugin.java`, `GoogleIdentityPlugin.java`, `secure-store.js`, `session-core.js`, `auth.js` semantics (only 401 ends a session; 503 keeps it; biometric lock; refresh rules).
- `tracking.js` (separate tracking token, never carries account token).
- `api.js` contract: Bearer auth, timeouts, offline detection, upload progress.
- Pure, tested business-logic modules: `intake-core.js`, `payment-receipt.js`, `passport-quality.js`, `progress-view.js` model parts, `pricing-view.js`, `payment-view.js` (FX rules — zero is never a rate), `checklist-view.js`, `egypt-journey.js`, `umrah-journey-view.js`, `errors-ar.js`, `experience-core.js`, `submission.js` (idempotency).
- The 154 mobile unit tests and the `mobile-app` / `service-journeys` Playwright projects — kept as the regression net; updated only where markup legitimately changes.
- Signing/release workflows and the version scheme (`0.3.<run>` / `versionCode = run_number`).
- Brand assets: `www/assets/brand/logo-*.png`, `web/public/brand`, Cairo font, navy `#082b58` / gold `#d6aa4b`.

## 4. Components to rebuild

- **Presentation layer**: all `screens/*.js` markup and the three stacked stylesheets (`app.css` + `design-integrated.css` overrides + `motion.css`) → one token-based design system.
- **Large screen modules**: `screens/requests.js` (973 lines) and `screens/intake.js` (742) → split into list / detail / actions and per-step components.
- **Icons**: hand-made set → vendored Lucide SVGs (ISC licence, copied as static SVG strings, no runtime dependency).
- **Navigation shell**: tab bar, headers, back behaviour, transitions.
- **Home**: currently a carousel + service cards; rebuild around “active request + next action”.
- **Request tracking UI**: one unified status timeline + “what you need to do now” card across all services.
- **UI primitives**: buttons, fields, cards, sheets, skeletons, empty/error states, toasts — formalised as components.

---

## 5. Proposed mobile UX architecture

Principles: one primary action per screen; the server's state drives what is shown (no client-invented statuses); everything a customer must do surfaces as a single «المطلوب منك الآن» card.

**Navigation (5 tabs, RTL, right-most = home):**
`الرئيسية` · `الخدمات` · `طلباتي` · `الإشعارات` (badge) · `حسابي`

**Core flows**
1. *Browse → Start*: Services → Service detail (requirements, price only if server returns an approved price, “price confirmed by the agency” otherwise) → Intake wizard.
2. *Intake wizard* (shared shell for every service): steps = Travelers → Documents → Contact → Review → Submit. Progress bar, autosave to existing `/intake-drafts`, reuse profile data and previously uploaded documents (`/customer/documents`).
3. *Track*: طلباتي → Request detail = status header + next-action card + timeline + documents + payment + deliverables.
4. *Pay*: next-action card → payment sheet (approved amount + currency, bank accounts from `/tracking/payment-accounts`, receipt capture) → “awaiting review”.
5. *Guest*: everything works without an account; طلباتي asks for phone + code (blocked until WhatsApp is configured — show agency WhatsApp/phone fallback, already implemented in `otp-support.js`).

## 6. Recommended screen structure

```
Onboarding (once) ─┐
                   ▼
Tabs
├── الرئيسية       greeting · active request + next action · services grid · unread notice · support (WhatsApp/phone)
├── الخدمات        verified services only (from /services/public + scope)
│   ├── Service detail (requirements, docs, price/“on request”)
│   └── Intake wizard  [Travelers → Documents → Contact → Review] → Submitted (reference, copy, track)
│        variants: Umrah (package, pilgrims, guarantor) · Egypt (air/land, travel plan) · Flight (search → request)
│                  · Ferry · Family visit · Visa · General enquiry
├── طلباتي         segmented: نشطة / مكتملة   (guest: phone → code → list)
│   └── Request detail: status · next action · timeline · documents (upload/replace) · offers/price approval
│                       · payment (accounts, receipt) · deliverables (visa, tickets) · Umrah journey
├── الإشعارات      list → opens the related request
└── حسابي          profile · contact · my documents · security (biometric, password) · about · legal · logout
```
≈ 20 screens (today ≈ 30 registered routes), mostly by merging hubs (`visasHub`, `serviceInfo`, `serviceDetail`) and the three request-detail variants (`requestDetail`, `orderDetail`, `trackedRequestDetail`) into one detail screen with one data adapter.

## 7. Design system direction

- **Tokens** (`tokens.css`, CSS custom properties, single source):
  - Colour: brand navy `#082b58` (primary, headers), gold `#d6aa4b` (accent only — highlights, active tab indicator, never body text on white: contrast too low), neutrals on white/`#f6f7f9`, semantic success/warning/danger/info each with text + background pair checked to WCAG AA 4.5:1.
  - Type: Cairo variable; scale 12/14/16/18/22/28; body 16, min 14; line-height 1.6.
  - Spacing 4-pt grid (4, 8, 12, 16, 24, 32); radius 10/14/20; 2 elevation levels only.
  - Touch targets ≥ 48 px; motion 150–220 ms, transform/opacity only, off under reduced-motion.
- **Components**: AppBar, TabBar, Button (primary/secondary/ghost/danger, loading), ListItem, Card, ServiceTile, StatusPill (maps server status → customer label), NextActionCard, Timeline, Stepper, Field/Select/DateField/PhoneField, FileUploadTile (camera/gallery/PDF, preview, quality hints), BottomSheet, Dialog, Skeleton, EmptyState, ErrorState (with retry), Toast, Badge, EnvironmentBadge.
- **RTL**: logical CSS properties only (`margin-inline-start`, `inset-inline-end`), `dir="auto"` for Latin input (passport numbers, emails, IATA codes), mirrored directional icons only.
- **Visual tone**: white surfaces, navy hierarchy, one gold accent per screen, no gradients beyond the brand header, no decorative illustration.
- Deliverable for approval (Phase 2): static clickable HTML prototype of the key screens inside `mobile/www` structure, screenshots at 360/390/412 px.

## 8. Step-by-step implementation plan

**Phase 2 — Design (needs your approval at the end)**
1. Tokens + component sheet (static page) — screenshots.
2. Prototype of 8 key screens: Home, Services, Service detail, Intake wizard step, Requests list, Request detail with next-action, Payment sheet, Account.
3. Customer-status mapping table: every backend status/stage → Arabic label + next action (sourced from `contact-request-progress/request-progress.js`, no new statuses).

**Phase 3 — Rebuild (isolated branch, strangler pattern)**
1. Add `tokens.css` + `components/` and vendored Lucide icons; keep the old CSS loaded until each screen is migrated.
2. New shell (5 tabs, app bar, transitions) behind the existing router.
3. Migrate screen by screen, each its own commit with tests: Account/Profile → Notifications → Home → Services/detail → Intake wizard (per service) → Requests list → Request detail → Payment → Umrah journey.
4. Unify the three request-detail screens behind one adapter (`customer` vs `tracking` source).
5. Remove the old CSS/screens only after their replacement passes unit + Playwright tests.
6. Add type-checking with `tsc --checkJs` + JSDoc types on `api.js`, adapters and core modules (TypeScript is already a devDependency; no bundler).

**Phase 4 — QA**: `npm test`, `npm run check`, `tsc --noEmit --checkJs`, backend suite on a disposable DB, web typecheck/lint/build, full Playwright (including `mobile-app` project at 360/390 px, RTL overflow checks), GitHub Actions on the final SHA, a11y audit (contrast, labels, focus order, font scaling 200%).

**Phase 5 — QA release**: `android-apk.yml` with the QA pre-release option → new `qa-v0.3.<run>` tag, verify the direct `.apk` link anonymously, record SHA-256 and signer cert, test report. **Only with your explicit approval to distribute**, and real-device results recorded separately.

## 9. Technical risks and dependencies

| # | Risk | Mitigation |
|---|---|---|
| R1 | WhatsApp OTP unconfigured → guest tracking/reset unusable regardless of design | Owner to configure provider; UI keeps phone/WhatsApp fallback |
| R2 | No real Android device testing has ever been done (camera, file picker, biometrics, Keystore) | Device checklist exists; needs a tester with 2 phones |
| R3 | Regressions in a large untyped vanilla-JS codebase | Strangler migration, keep 154 unit tests + Playwright mobile project green per step |
| R4 | Many open draft PRs (#181–#196, #207) may conflict or be obsolete | Decide which are dead before Phase 3 (D8) |
| R5 | `CLAUDE.md` still names #91 as the active integration branch, but `main` moved far past it (#197, #208 merged) | Confirm source of truth = `main` (D8) |
| R6 | Installed-app compatibility: old APKs talk to the same API | No API contract changes; `release-compatibility.json` respected |
| R7 | Prices are test data; FIXED pricing not approved | UI shows only server-approved prices, else “يحدد بعد المراجعة” |
| R8 | Flight results are agency inventory/provider data, not live bookable seats | Keep “booking request” wording; never show “book now / confirmed” |
| R9 | HTML-string rendering (`innerHTML`) across screens — XSS surface depends on consistent escaping | New components escape by default; add a unit test per component (not yet audited in detail) |
| R10 | Google sign-in on Android needs an Android OAuth client per signing key | Owner/Google Cloud config |
| R11 | Push notifications don't exist; adding them needs Firebase + backend changes | Out of scope unless approved (D5) |

## 10. Decisions requiring your approval

| # | Decision | My recommendation |
|---|---|---|
| D1 | Tech approach: keep Capacitor 8 + vanilla ES modules (no bundler) and rebuild the presentation layer in place, vs. migrate to a framework (React/Vite or Next static export) | **Keep the stack**, add JSDoc + `tsc --checkJs` typing. A framework rewrite adds a build chain and re-implements tested logic for little customer benefit. |
| D2 | Navigation: 5 tabs (Home, Services, My Requests, Notifications, Profile) vs. current 4 | **5 tabs** as in your brief |
| D3 | Icons: vendor Lucide SVGs (static, ISC) replacing the custom set | Yes |
| D4 | Hotels: keep hidden in the app (owner decision 2026-11-11) | Keep hidden |
| D5 | Push notifications (Firebase) — new dependency + backend work | Defer; in-app notifications only for this rebuild |
| D6 | WhatsApp-OTP as an *account* login method (does not exist today — only for tracking/reset) | Not in this rebuild unless you want it; it is a backend auth change needing its own security review |
| D7 | QA APK backend: QA server (`qa-backend…`, current config) vs. staging | QA server, as today |
| D8 | Source of truth: `main` (not #91), and close/ignore stale draft PRs #181–#196/#207 | Work from `main` on a new feature branch |
| D9 | Confirm `nasaem-platform-professional` is not to be touched | Do not touch |
| D10 | Visual direction: navy + white + single gold accent, Cairo, minimal (section 7) | Approve to start Phase 2 prototype |

Owner-only blockers (outside code): WhatsApp provider, Android release signing secrets, real-device tester, approved prices/packages, Google Android OAuth clients, custom domain.
