# Branch baseline and PR disposition

No branch has been merged, closed or deleted. This is a recommendation for the owner to approve.

## Baseline decision

| Branch | Ahead of `main` | Relationship |
|---|---|---|
| `main` | — | Stale: last commit 2026-08-31; no mobile app; still has the Prisma import PR #57 fixes. |
| `codex/nasaem-unified` (PR #72) | 177 | Everything in the baseline **except** 2 commits. |
| `codex/nasaem-mobile-v2` (PR #73) | 213 | **A strict superset of `main`** and of `unified` minus 2 commits. |

**Baseline = `codex/nasaem-mobile-v2`.** `stabilize/production-readiness` was created from it (`853c4ea`).

The 2 `unified`-only commits (`822b1a8`, `b9fa84c`) are a competing mobile restyle (`mobile/` only, 19 files: `ui.tsx`, `storage.ts`, theme and screens). They overlap 8 mobile files with the baseline's 38 `mobile-v2`-only commits (rebuilt journeys + the tracking payment-currency backend) and touch no backend file. They are **not** taken: the stabilization brief excludes UI redesign. If web-session storage (`mobile/src/storage.ts`) is wanted later, it can be cherry-picked on its own. Nothing else would be lost by consolidating on the baseline.

Evidence: `git rev-list --left-right --count` (main…unified = 0/177, main…mobile-v2 = 0/213, unified…mobile-v2 = 2/38) and `git diff --name-only` (the 2 commits touch only `mobile/**`).

## PR #53 – #73

`git cherry` reports every PR's commits as "not in baseline" because the history was rewritten and re-implemented; the *content* check below is therefore by feature, not by SHA.

| PR | Purpose | Still needed? | Superseded? | Recommended action |
|---|---|---|---|---|
| 42–52 | Launch readiness, multi-currency, smart-case, Egypt journey, hydration fix | Done | Merged into `main`; contained in baseline | None |
| 53 | Egypt passport requirement + seed reconcile | No | **Yes** — the baseline has migration `…ensure_egypt_clearance_passport_requirement` and `reconcileEgyptClearanceRequirements()` in `seed.js`. | Close. One CI commit ("serialize backend db tests") is optional; the parallel-run flake was instead fixed at its root (`smartCaseAssignment`). |
| 54 | Egypt provider hand-off workspace | **Yes (feature)** | **No.** Adds `GET /api/contact-requests/:id/providers` (a case-scoped provider directory so EMPLOYEE staff can hand a case off; `/suppliers` is manager-only) and +237 lines in `case-workspace.tsx`. The baseline has `provider-submissions` but not this. | Keep. Not a stabilization item; rebase onto the stabilization branch after it lands. |
| 55 | Persistent upload storage (`UPLOAD_ROOT`) | No | **Yes** — baseline uses the shared `UPLOAD_ROOT` everywhere (fail-closed in production, traversal-safe resolver). | Close. |
| 56 | Issue: TRIP-provider fares are unpriced | Yes | Partly — the stabilization branch now **refuses** to book unpriced provider fares online. | Keep open: needs a stored-quote design. |
| 57 | Prisma ESM import under Node 22 | No | **Yes** (1 commit; patch-equivalent in baseline). | Close. |
| 58 | Egypt passport upload fixes | No | **Yes** — baseline has `ensureDraft()` before upload, magic-byte validation and its own `upload-validation.test.js`. | Close. |
| 59 | `integration/launch-readiness` → main | No | **Yes** — an ancestor of the baseline. | Close. |
| 60 | Service-first homepage UX | Partly | Mostly — later homepage commits (`aed6525`, `1870607`) in the baseline restructure the same area. | Review commit `6e39727` (request confirmation + failure recovery) for the UX phase; close the rest. |
| 61–65 | Homepage entry, trust strip, Next 16.3.4, header CTA | Done | Merged into the integration branch; contained in baseline | None |
| 66 | OCR OOM fix + 2 flight-booking fixes | OCR yes | **Rewritten.** OCR downscale **ported** (commit `9b1bd1c`: plus pixel cap, gate, timeout). Flight commits (client `amount` ±0.5 % check; `customerId` only when phones match) were **weaker** than the server-side pricing / token model now implemented (`482cab9`) and still trusted the client price and linked by passport. | Close as superseded by the stabilization commits. |
| 67 | Older "Mobile V2 foundation" (56 commits) | Ideas only | **Yes** by the baseline's rebuilt mobile (customer-only). | Mine the live-cached-catalog / offline idea for the mobile phase, then close. |
| 68 | Start the Nasaem Android app | No | **Yes** — an ancestor of the baseline. | Close. |
| 69 | Staff notifications screen (mobile) | No | Merged, then removed deliberately — staff use the web admin. | None |
| 70 | Case notes, assignment notifications, QAR, web notifications | No | **Yes** — 0 unique commits vs baseline. | Close. |
| 71 | Customer-platform completion | No | **Yes** — 0 unique commits vs baseline. | Close. |
| 72 | `unified` → feature branch | No | The baseline contains all but the 2 restyle commits. | Close after deciding on `storage.ts`. |
| 73 | `mobile-v2` → `main` (draft, 213 commits) | The baseline itself | Replaced by the stabilization PR (baseline + 14 reviewed commits). | Keep until the stabilization PR is opened; then close in favour of it. |

## Branch sprawl

236 remote branches; 216 not merged into `main`; 185 under `feature/*` (e.g. `feature/flight-booking-employee-console` 1–12 all point at one commit). Deleting them is a separate, owner-approved clean-up step; nothing was deleted.

## Suggested merge order (after owner review)

1. Open one PR `stabilize/production-readiness → main`. It carries the baseline (213 commits already reviewed in Phase 1) plus the stabilization commits, so reviewers can focus on `853c4ea..HEAD`.
2. Close PRs 53, 55, 57, 58, 59, 66, 68, 70, 71, 72, 73 with a pointer to it.
3. Keep 54 (rebase), 56, 60 (cherry-pick `6e39727`), 67 (idea mining) for later work.
