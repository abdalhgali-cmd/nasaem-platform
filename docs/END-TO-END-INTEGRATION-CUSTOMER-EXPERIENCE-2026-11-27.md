# Nasaem — Full Integration & Customer Journey Remediation Plan
Date: 2026-11-27 | Baseline: main `2c40487` and current draft PR #212.
**Status: audit + execution plan, not a completed end-to-end integration.**
**Operating scope:** customer-facing Umrah and Egypt security clearance per recorded owner decision. Keep other service modules available in code; do not expose unverified live airline/hotel/ferry booking.

## 1. System of record
| Component | Source | Responsibility |
|---|---|---|
| Express API + PostgreSQL | `backend/src/modules/**`, `backend/prisma/schema.prisma` | Service catalog, prices, contacts, cases, document requirements, payment decisions, progress, audit |
| Customer web | `web/src/app/**` | Published offer browsing, intake, tracking |
| Customer Android | `mobile/www/js/screens/**` | Equivalent customer experience, auth/biometric, documents, receipts and notifications |
| Staff operations | `backend/public/**`, `web/src/app/admin/**` | Document review, quotes, financial review, execution and delivery |
| Provider connections | flights/ferries/payment provider adapters | Must be labelled MANUAL/UNCONFIGURED unless integration verified against real sandbox/live source |

Do not duplicate financial or progress logic in clients. The server's `progress.steps`, `progress.blockers`, `nextAction`, `pricingSnapshot` / `Invoice.version` and published deliverables are authoritative. Existing policies: `docs/WORKFLOW-POLICY.md`, `docs/SERVICE-ACCEPTANCE.md`.

## 2. End-to-end integration map and acceptance cases
| Stage | Android / web | API / staff | Acceptance evidence |
|---|---|---|---|
| 1. Discover | published Umrah package or Egypt entry method; no stale price presented as current | public catalog + active flags | same product/amount/currency/availability across surfaces, offline clearly labelled |
| 2. Select | service-specific details, processing time only if configured | service / visa / package IDs and requirement engine | selected ID survives navigation, browser refresh and Android process recreation where supported |
| 3. Enter travelers | multiple travelers with correct passport/phone fields | intake draft + request creation | validate required fields, prevent double submit, no cross-traveler attachment |
| 4. Attach documents | per-traveler checklist; replace rejected file | requirement + document status API | rejected reason displayed, exact traveler/requirement selected, safe retry |
| 5. Review/price | FIXED total shown and confirmed, QUOTE version shown before accepting | server recalculates total; invoice version; expiry | 409 price-change never creates a charge or silently proceeds |
| 6. Pay | official account, chosen currency, receipt submission | payment accounts, review and settlement | upload != payment confirmation; both sides share status and rejection reason |
| 7. Execute | progress + blockers after payment accepted | staff records execution only when readiness passes | no automatic execution on receipt upload; no false completed status |
| 8. Deliver | per-traveler approved files; track latest status | publish deliverables; close only on full coverage | drafts hidden, final links scoped to right traveler/customer |
| 9. Notify/support | deep link to correct case/action; WhatsApp as fallback | notification event + case IDs | correct case opens from web/Android, stale push handled safely |

### Priority defects / integration risks to verify
- **P0** Android/web mismatch: legacy app may not send `acceptedTotal` or `invoiceVersion` (documented in `docs/WORKFLOW-POLICY.md`); confirm build compatibility before enabling FIXED prices. No undocumented workaround.
- **P0** Prevent any display of stale/offline catalog data as current/bookable. Re-fetch at the price confirmation boundary and handle catalog update race.
- **P0** Route authorization/tenant isolation on document download, tracking and receipt mutation, including direct URL/object-ID access.
- **P1** Mobile helper back/retry and pending request lifecycle; prevent obsolete async responses from changing a newer screen.
- **P1** Exact rejected-document replacement path and correct staff notification link.
- **P1** Unify QUOTE/FIXED and progress labels for all surfaces, no alternate client-side status logic on customer-facing critical actions.
- **P2** Design-system parity, accessibility, device performance and optional AI read-only support.

## 3. Customer journey evaluation — evidence-based baseline
**Assessment is heuristic from repository code and docs, not measured user satisfaction. No invented numerical score.**

| Dimension | Existing evidence | Risk/gap | Target test |
|---|---|---|---|
| Service discovery | distinct Umrah/Egypt screens; new guide on draft branch | customer may not know which variant is available | 5 users choose correct service without staff guidance |
| Price clarity | backend fixed-price snapshot, Egypt variant prices, Umrah package price | changes/expired cache or legacy app | price seen equals accepted snapshot on every test; 409 visibly handled |
| Form simplicity | requirement-driven intake + drafts | repeated data and document errors | benchmark median completion time, retries and abandonment |
| Trust | documented payment review and server progress | uploaded receipt may be mistaken for paid | zero testers confuse upload with payment confirmation |
| Tracking | phone OTP / account requests and published files | deep links and stale notifications | 100% tested links open intended case and next action |
| Accessibility | Arabic RTL, labelled controls, reduced motion | untested real device/TalkBack | 44–48px targets, text zoom, keyboard/screen reader tasks |
| Reliability | CI, disposable PostgreSQL and Android build checks | no real-device or external-provider acceptance evidence | explicit device/provider QA, zero critical flow failures |

### KPIs to instrument later (consent & data minimization)
- Discover -> choose service conversion.
- Start -> submitted conversion; form abandonment stage (aggregate only).
- Time to successful request submission and time to document acceptance.
- Number of document rejections per traveler/requirement.
- Accepted quote rate and price-change 409 rate.
- Receipt upload -> accountant decision time.
- Time from approved payment -> execution -> published delivery.
- Notification click -> correct request/action success.
No passport contents, tokens, card/account identifiers or raw message text in product analytics. Establish consent/privacy review before enabling telemetry.

## 4. Implementation sequence (small PRs, no destructive migrations)
1. **P0 contract guardrails:** inventory exact API endpoints and producers/consumers. Add contract tests Android/web/backend for FIXED total, QUOTE version, 401 vs 503, no catalog prices when stale, per-tenant ownership. Remove any duplicate client business decisions.
2. **P0 complete an Umrah/Egypt two-traveler QA case:** from mobile and web through back-office review, reupload, price/acceptance, rejected receipt + corrected receipt, execution, two deliverables. Capture expected server/client status per step and screenshots. Do not simulate provider fulfillment.
3. **P1 fix discovered mismatches:** atomic request creation, resuming payment, exact file target, deep links, offline/retry. Add regression test *before* fix when possible.
4. **P1 unify design:** use official brand design tokens and accessible icon system across home, intake, requests, finance and delivery. Test 320/360/390/430px and Android font scaling.
5. **P2 smart assistant:** phase 1 grounded read-only FAQ/search over published catalog and status (only verified owner), no credentials sent to model, no auto-booking/payment; actions require explicit customer confirmation.
6. **Release gates:** green CI at final SHA + Android build + real-device smoke + role/tenant/security tests + approved QA. Explicit owner approval to merge/deploy/distribute. For Production DB changes: verified real backup AND restore, including uploaded files.

## 5. Definition of done (per service, on BOTH web + Android)
- Customer can complete from discovery to a real request using published service/price; no invisible charge.
- Employee sees same request, each traveler and document requirement, and can reject exactly one file with reason.
- Customer replaces the right file and sees updated status and action.
- Accountant decision and customer payment status agree; nothing marks PAID before approval.
- Execution cannot start until blockers clear; publish-only final files and all travelers' coverage enforced.
- A notification leads to that request rather than generic requests list.
- Retried calls, disconnected Android, expired login, unconfigured provider and stale price are safe and understandable.
- Cases for unknown user, other tenant and direct-ID access fail closed.
- All conditions recorded as **VERIFIED / FAILED / BLOCKED / NOT TESTED** with SHA and test evidence.

## 6. Initial work tracking
- VERIFIED (source only): module and routes exist, documented workflow invariants, #212 draft enhancements.
- VERIFIED (previous SHA only): Android build on #212 earlier head; see GitHub Actions. Do not extrapolate to future commits.
- NOT TESTED: current-branch complete web+Android two-traveler journey, production/staging runtime parity, real phone, external supplier integrations, user satisfaction.
- NEXT: add targeted regressions for assistant async navigation and catalog availability; then execute single-service QA matrix on disposable environment.

**Data note:** Owner reports all current customer records are test data; this does not by itself identify or authorize deleting/resetting the Production DB. No records are changed by this plan.
