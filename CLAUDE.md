# Nasaem Platform — Claude Code operating instructions

Purpose: finish the travel agency's API, back-office, customer website, Android app and notifications safely. This is a live business system; avoid destructive shortcuts.

## Start here
- Read `TASKS.md` first. Check GitHub PR/check state before treating its snapshot as current.
- Current integration basis: PR #87 (`claude/busy-hamilton-1ccxm1`), which already contains #77–#86; do not merge the earlier stack again.
- PR #88 (fixed-price currency consent) and PR #89 (payment-review boolean parsing) are separate sibling patches. Review/verify and integrate both into a **new** integration branch; avoid overwriting either.
- Keep `web/CLAUDE.md` and its `web/AGENTS.md` rules intact (Next.js-specific guidance).

## How to work efficiently
1. Inspect only the relevant code, existing tests, PR diffs and documentation. Search before opening large files. Do not repeat repo-wide audits.
2. Prioritize confirmed release blockers: failed CI, money/currency safety, cross-organization authorization, request lifecycle, admin deep links, mobile compatibility.
3. Make small reviewable commits, preserve changes already made, and add targeted regression tests for each fix.
4. Run affected tests first on a **disposable** database. Run the whole backend/web/Playwright/Android CI suite on the final candidate; record exact commit SHA and actual results.
5. Update `TASKS.md` only when status is evidence-backed (PR, test run, file, or reproducible defect). Short updates: DONE / BLOCKED / NEXT; avoid verbose progress reports.
6. Continue through independently safe tasks without pausing for minor implementation decisions. At approval gates, stop that operation and carry on with unrelated safe work.

## Non-negotiable safety
- Never merge into `main`, deploy to staging/production, alter live DBs, or distribute production APK/AAB without the owner's explicit authorization for that operation.
- Do not delete customer data, change production financial balances to make tests pass, bypass security, expose credentials, or lower test quality to obtain green CI.
- Preserve tenant isolation, audit logs, idempotency and currency-specific financial accounting.
- Before **authorized staging migration**, verify a real staging DB + uploads backup **and a successful restore test**. A synthetic GitHub Actions backup drill is not this evidence.
- Roll **forward**, not back to older backend builds after new refund/session data or migrations; follow `docs/admin-remediation-release.md` and migration guardrails.
- Do not enable public FIXED pricing before compatible Android/web versions and the appropriate acceptance checks.
- Treat customer-visible flight/hotel availability and prices as quotes unless confirmed by an actual live provider integration.

## Completion / handoff
- A single reviewed integration PR with green CI, no known critical security/finance bugs, a tested end-to-end journey, and an evidence-based staging checklist.
- Report what is VERIFIED, BLOCKED, and NOT TESTED; clearly distinguish browser emulation from on-device testing.
- Prepare staging/production approval requests separately. Do not infer consent from these instructions.
