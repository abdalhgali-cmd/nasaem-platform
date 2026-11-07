# Nasaem Platform — Claude Code instructions

**Goal:** Finish the agency API, staff admin, customer website, Android app, pricing, payments and notifications safely. Continue the existing work, do not restart or duplicate it.

## Source of truth
- Active integration branch / PR: `claude/release-integration` / **#91**. It **already integrates** #87, #88 and #89 and fixes the airline audit-log race. Do not cherry-pick or merge those PRs again.
- Read `TASKS.md` for release tasks and acceptance gates. Treat completed CI, actual code and GitHub as more current than any stale status in that file.
- Keep `web/CLAUDE.md` and `web/AGENTS.md` intact; their Next.js-specific rules still apply.
- Railway **staging already exists**: project `spirited-luck`, service `adaptable-quietude`, PostgreSQL 18 and persisted `/data/uploads`. Lack of Claude access does not mean it is absent. **Owner decision 2026-11-01:** all current staging records are disposable test data, so a staging backup/restore is **not** a blocker for development or a staging release. This exception is for staging only: never delete or overwrite production data, and production backup requirements stay in force.

## Execution and token efficiency
1. Start with `git status`, the current branch SHA, `TASKS.md` and outstanding CI checks. Inspect only files needed for the next task; don't repeat whole-repository audits.
2. Finish P0 issues before lower-priority UI improvements. Fix verified defects with minimal diffs, relevant regression tests and small descriptive commits.
3. Run targeted tests first against a disposable DB. Run full CI only for integrated release candidates or material changes; record results against the exact SHA. Local 87/87 does not replace a pending/failed GitHub Actions run.
4. Update `TASKS.md` with VERIFIED / BLOCKED / NOT TESTED evidence and the next task. Keep interim reports short: DONE / BLOCKED / NEXT.
5. Continue safe implementation independently without repeatedly requesting approval. Escalate only required external credentials, decisions and release gates.

## Safety — approval required
- **Do not merge into `main`, deploy staging/production, migrate live databases, change live financial records or distribute Android builds without explicit owner approval for that action.**
- Do not delete production/customer data, weaken auth/CSRF/tenant isolation, hide failures, remove assertions to make CI green, or expose credentials.
- Before any approved **production** migration: verify a **real production PostgreSQL + uploads backup and a successful restore**. CI's synthetic backup drill is not sufficient. (Staging: not required — its data is disposable, owner decision 2026-11-01.)
- Follow `docs/admin-remediation-release.md`: new refund/session migrations can make rollback to old app code unsafe; prepare roll-forward recovery.
- Validate installed Android app compatibility and real-device tests before enabling FIXED pricing. Never present unconnected flight/hotel results as real-time bookable inventory.

## Definition of done
A reviewed, cohesive #91 candidate; green CI on its final SHA; finance/security and end-to-end acceptance; verified production backup/restore before a production release, and explicit approvals before any release (staging backup/restore is not required, owner decision 2026-11-01). Clearly identify unverified device/provider/infrastructure checks.

## Claude ↔ Codex workflow
Claude Code leads; OpenAI Codex implements and reviews as an independent second engineer. The owner decides.
- **Allowed without asking:** inspecting, analysing, testing; implementing, committing and pushing on a `claude/*` or `codex/*` work branch; opening a **draft** PR.
- **Approval required (in addition to the list above):** marking a PR ready, force-push, deleting a branch, pushing to `main`; creating, changing or deleting secrets/API keys; disabling a service or workflow (including AI Dev Orchestra and NotebookLM); running Codex as implementer (`codex-implement.sh`) once per approved task plan. Approving a plan does not approve every command in it, nor a merge or deploy.
- **Never discard local work:** no `git reset --hard`, `git clean`, `git restore`, `git checkout -f`, `git stash drop/clear`, `git branch -D` or `git worktree remove/prune`. Preserve unmerged Codex work in other branches and worktrees.
- **Never** run Codex with `--full-auto`, `danger-full-access` or `--dangerously-*`, call the `codex_implement` bridge tool, or put secrets in prompts sent to Codex (Codex can read files outside its sandbox).
- **Task flow:** inspect without changing files → plan (design, files, risks, tests) → read-only Codex review of the plan → owner approval → implement in a task worktree → independent read-only Codex review of diff and tests → report and open a draft PR.
- **Scripts** (`.codex/scripts/`):
  - Task worktree: `git worktree add -b codex/<slug> ../nasaem-tasks/<slug> origin/main` (slug: lowercase letters, digits, hyphens). Install dependencies there first: Codex has no network.
  - `bash .codex/scripts/codex-review.sh <dir> <prompt-file> <output-file>`: fresh `codex exec --sandbox read-only --ephemeral`, never resumed.
  - `bash .codex/scripts/codex-implement.sh <slug> <prompt-file> <output-file>`: `codex exec --sandbox workspace-write --ephemeral`, no network; only the worktree and `../nasaem-tasks/.tmp/<slug>` are writable, and Codex cannot commit.
  - `bash .codex/scripts/tests/test-codex-scripts.sh`: offline tests for both scripts; run after changing them.
- The bridge's `codex_review_*` MCP tools stay allowed until `codex-review.sh` passes a real authenticated review; note that they resume earlier Codex sessions without `--sandbox`.
