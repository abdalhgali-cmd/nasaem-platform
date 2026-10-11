# Nasaem Platform — Claude Code instructions

**Goal:** Finish the agency API, staff admin, customer website, Android app, pricing, payments and notifications safely. Continue the existing work, do not restart or duplicate it.

## Source of truth
- Active integration branch / PR: `claude/release-integration` / **#91**. It **already integrates** #87, #88 and #89 and fixes the airline audit-log race. Do not cherry-pick or merge those PRs again.
- Read `TASKS.md` for release tasks and acceptance gates. Treat completed CI, actual code and GitHub as more current than any stale status in that file.
- Keep `web/CLAUDE.md` and `web/AGENTS.md` intact; their Next.js-specific rules still apply.
- Railway **staging already exists**: project `spirited-luck`, service `adaptable-quietude`, PostgreSQL 18 and persisted `/data/uploads`. It is **not** a disposable test database; lack of Claude access does not mean it is absent.

## Execution and token efficiency
1. Start with `git status`, the current branch SHA, `TASKS.md` and outstanding CI checks. Inspect only files needed for the next task; don't repeat whole-repository audits.
2. Finish P0 issues before lower-priority UI improvements. Fix verified defects with minimal diffs, relevant regression tests and small descriptive commits.
3. Run targeted tests first against a disposable DB. Run full CI only for integrated release candidates or material changes; record results against the exact SHA. Local 87/87 does not replace a pending/failed GitHub Actions run.
4. Update `TASKS.md` with VERIFIED / BLOCKED / NOT TESTED evidence and the next task. Keep interim reports short: DONE / BLOCKED / NEXT.
5. Continue safe implementation independently without repeatedly requesting approval. Escalate only required external credentials, decisions and release gates.

## Safety — approval required
- **Do not merge into `main`, deploy staging/production, migrate live databases, change live financial records or distribute Android builds without explicit owner approval for that action.**
- Do not delete production/customer data, weaken auth/CSRF/tenant isolation, hide failures, remove assertions to make CI green, or expose credentials.
- Before any separately approved staging migration: verify a **real staging PostgreSQL + uploads backup and a successful restore**. CI's synthetic backup drill is not sufficient.
- Follow `docs/admin-remediation-release.md`: new refund/session migrations can make rollback to old app code unsafe; prepare roll-forward recovery.
- Validate installed Android app compatibility and real-device tests before enabling FIXED pricing. Never present unconnected flight/hotel results as real-time bookable inventory.

## Definition of done
A reviewed, cohesive #91 candidate; green CI on its final SHA; finance/security and end-to-end acceptance; verified staging backup/restore and explicit approvals before any release. Clearly identify unverified device/provider/infrastructure checks.
