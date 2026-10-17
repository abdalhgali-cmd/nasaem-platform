# NASAEM — Phase 2 Completion / Release Preparation

Status: development coordination only. This document is NOT permission to release, deploy, issue tickets, change live data, or connect providers.

## Baseline
- Repository: `abdalhgali-cmd/nasaem-platform`
- Working integration base: `integration/phase2-completion-20261017`
- Starting commit: `ba05b6ca8634a4f4b90ef9325dc43d8c67082751` (PR #120 combined PRs #111, #115, #112, #113, #116, #117, #118, #114; CI green).
- Do not use `main` or the older `claude/release-integration` directly as the base of Phase 2 feature branches.
- Keep PR #120 in draft; no change to `main`, release branches, staging, Railway, Vercel or production data without distinct owner approval.

## Goal
Finish product functionality first, then conduct ONE comprehensive owner acceptance pass of the website, Android APK, and staff dashboard. Targeted automated tests and safe code reviews MUST still run during implementation.

## Owners & order
### Codex (parallel track)
1. **#105 — Offers**. Server-enforced validity, fixed price/currency, expiry, caps/permissions, staff controls and audit. Reuse current service forms; never invent offers, prices or availability.
2. **#106 — Hotels and ferries**. Better request forms, filters and guest experience. Keep request-only until real provider prices and availability are confirmed. No fake tickets, rooms or instant booking.
3. **#107 — Brand, content and legal pages**. Official agency assets only. No invented licenses, testimonials or partner relationships. Legal copy and official business details require owner approval before publishing.
4. **#108 — Mobile safety and UX**. Guest-first, configurable inactivity lock, biometrics/device unlock when supported with secure fallback, no looping logouts or insecure local passport storage. Do not release an APK. Record real-device cases for final validation.

### Claude (parallel track)
1. Audit PR #120's combined flows and pending low-risk deficiencies without rebuilding existing features.
2. **#109 — Provider adapters and readiness**. Inventory actual agreements/API access for Tarco/Badr/Sudan Airways/NDC. Build isolated, testable adapters/contracts with mock/sandbox only where credentials or permission are absent. Always fall back to request-only; do not claim live prices/PNRs/issuance.
3. Prepare the **#110 full acceptance matrix** and #97 release readiness evidence, but schedule the final cross-platform / device acceptance AFTER all Phase 2 features are integrated.
4. Focus on payments, authorization, isolation, receipt visibility, currency separation and Umrah/Egypt preservation while reviewing any conflicts.

## Issue workflow
- Read `CLAUDE.md`, `TASKS.md` and the exact GitHub Issue first. Inspect existing code before changing it; avoid duplicate functionality.
- Branch from latest Phase 2 integration base in isolated worktree, one PR per issue, target `integration/phase2-completion-20261017`.
- Implement only documented requirements and their regressions; add targeted automated tests. Keep updates concise: DONE / TESTS / PR / BLOCKED / NEXT.
- Resolve overlaps carefully, retaining both sides' business rules and tests. Validate every integration change before advancing.
- Do not write or expose secrets. No fake prices, availability, partner integrations, legal assurances or issuing tickets without provider confirmation and PNR.
- No emails, third-party requests, customer notifications, deployment or finance actions without explicit owner approval.

## Final end-to-end test & release gate (#110)
After #105–#109 reach COMPLETE or explicitly BLOCKED-by-external-authorization:
- Build the complete combined branch and run **backend full suite, Next.js typecheck/lint/build, Playwright all projects, Android checks/APK build**.
- Test web/app/admin full journeys: service → data → documents → price and currency → bank details/receipt → finance review → execution → delivery; cancellations, payment rejection, idempotency, resume, 409, invalid documents, offline/low-network, guest access.
- Validate mobile UI/RTL/accessibility on a physical Android device; verify biometric/background/inactivity policy.
- Ensure staging API and CORS, and conduct real staging backup/restore using owner-approved non-production data; verify deployment and price settings independently. No production deployment or live DB changes as part of tests.
- Mark every acceptance item PASS with CI/device evidence, BLOCKED with dependency, or NOT TESTED. Do not claim release-ready if blockers remain.
- Submit a single decision report to the owner with the integrated PR, test links, APK candidate and risks; await explicit approval for any release/DNS changes.

## Known external blockers
- Vercel account/project paused; hosting migration is a separate task and should not distract from completion work.
- Provider permission, documents, credentials and real-time availability require verified authorization before live #109 can finish.
- Agency pricing and legal/brand details need owner-provided and approved source data.
- Real Android device acceptance and staging backup restoration are outstanding.
