# Nasaem Platform — Release tasks

Snapshot: 2026-10-11. **Live GitHub Actions results supersede this file.** Only check boxes with proof; no rollout is authorized.

## Verified baseline
- [x] PR #87 (`055f6bb8`) is an open, unmerged integration proposal containing #77–#86. Git ancestry check: #86 -> #87 is 17 commits ahead, zero behind.
- [x] PR #87 CI completed successfully: Backend tests, Frontend typecheck/build, Playwright **87/87**, synthetic PostgreSQL backup/restore drill, QA Android APK build.
- [x] PR #88 (`4afd3173`) is an open draft based on #87. Backend, Web, synthetic backup drill and QA APK checks succeeded. **Playwright FAILED**: 80 passed, one failed, six not run. The failing scenario is `web/e2e/mobile-app.spec.ts:136` (admin enabling/disabling and auditing FX rates). At line 152, the first row of `#fx-history-body` failed to show `AED: غير فعّال`. Failure cause NOT VERIFIED; unrelated to PR #88's small pricing change unless demonstrated.
- [x] PR #89 (`d49bd647`) is an open draft based on #87. Backend, Web and synthetic backup drill passed at last check; Playwright was still in progress. Its separate fix addresses `pendingReview: "false"` string incorrectly coerced to true.
- [x] Root `CLAUDE.md` added only on the documentation handoff branch. Existing `web/CLAUDE.md` remains untouched.

## P0 — finish isolated review and integration
- [ ] Verify fresh CI results for #88 and #89 and inspect reviews; do not silently relabel failing checks as passing.
- [ ] Reproduce FX-rate history failure on a **disposable** seeded test DB; inspect UI refresh, history ordering, API response and async races. Run the affected test first, then the affected project. Fix code or timing root cause, not assertions as a shortcut.
- [ ] Confirm both #88 and #89 regression tests. Create an integration branch from #87 and incorporate their tested fixes without accidentally duplicating the #77–#86 stack. Resolve any conflicts explicitly.
- [ ] Review the combined candidate for tenant isolation, role permissions, CSRF/session handling, exact fixed-price consent, payment idempotency/refunds, audit trail and currency-aware reports.
- [ ] Validate admin workflow: inquiry vs service request; list, direct request/notification link, assignment, documents, quote version, payment review, execution, delivery, reopening.
- [ ] Run full backend, frontend, Android unit/build and Playwright CI on the exact final SHA, and seek independent review. No deployment during this task.

## P1 — customer-facing acceptance
- [ ] Android compatibility: existing installed client vs new quote-version/FIXED API; retain login session during network loss, retain draft, attach documents per traveler.
- [ ] Real Android device test remains **NOT VERIFIED**; QA-signed CI APK does not prove device operation or production update-signing compatibility.
- [ ] Verify Umrah, Egyptian security approval, Saudi family visit, flight request, hotel request and ferry request as real end-to-end service journeys where implemented; clearly label unfinished provider integrations as quotation-only.
- [ ] Confirm notifications (staff/customer) open the **correct request**, and test deduplication and WhatsApp failure/retry without data leaks.

## Release gates (explicit owner approval required)
- [ ] Confirm target Railway staging service/source SHA, migrations, required variables and `/api/health`; do not use older pre-refund backend SHA.
- [ ] Make a real staging PostgreSQL 18 and `/data/uploads` backup with restore verification. CI's disposable backup drill is insufficient.
- [ ] Run read-only finance diagnostics against a copy of staging data; verify migration preflight and forward-only recovery strategy per `docs/admin-remediation-release.md`.
- [ ] Only with staging-deploy approval: deploy immutable candidate SHA to staging and run office PC, mobile and transaction acceptance. Production requires separate approval.
- [ ] Only with distribution approval: validate Android signing/update compatibility and ship compatible app before enabling FIXED pricing for customers.

## References
- PRs: https://github.com/abdalhgali-cmd/nasaem-platform/pull/87 , /pull/88 , /pull/89
- Failed #88 browser run: https://github.com/abdalhgali-cmd/nasaem-platform/actions/runs/38174757532
- PR #87 successful CI: https://github.com/abdalhgali-cmd/nasaem-platform/actions/runs/38173136232
- Release hazards: `docs/admin-remediation-release.md`. Work on a disposable DB as described in `README.md`.

**Next action for Claude Code:** investigate the #88 FX-rate audit-history Playwright failure, then create the verified, reviewable combined candidate. Short status report only: DONE / BLOCKED / NEXT.
