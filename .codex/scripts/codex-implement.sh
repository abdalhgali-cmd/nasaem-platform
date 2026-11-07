#!/usr/bin/env bash
# Codex implementation inside an isolated task worktree (../nasaem-tasks/<slug>, branch codex/<slug>).
# No --full-auto and no network; writes stay inside the worktree, and Codex cannot commit
# because the repository's .git directory lies outside it. Review and commit happen afterwards.
# Usage: codex-implement.sh <task-slug> <prompt-file> <output-file>
set -euo pipefail
if [ "$#" -ne 3 ]; then
  echo "usage: $0 <task-slug> <prompt-file> <output-file>" >&2
  exit 2
fi
SLUG="$1"
PROMPT="$2"
OUT="$3"
if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]]; then
  echo "invalid task slug: use lowercase letters, digits and hyphens" >&2
  exit 2
fi
COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || { echo "run this from inside the nasaem-platform repository" >&2; exit 2; }
COMMON="$(cd "$COMMON" && pwd -P)"
ROOT="$(dirname "$COMMON")"
WT="$(dirname "$ROOT")/nasaem-tasks/$SLUG"
[ -d "$WT" ] || { echo "task worktree not found: $WT (create it with git worktree add first)" >&2; exit 2; }
WT="$(cd "$WT" && pwd -P)"
if [ "$WT" = "$ROOT" ]; then
  echo "refusing to run in the main checkout: $WT" >&2
  exit 2
fi
WT_COMMON="$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -z "$WT_COMMON" ] || [ "$(cd "$WT_COMMON" && pwd -P)" != "$COMMON" ]; then
  echo "not a worktree of this repository: $WT" >&2
  exit 2
fi
if [ "$(git -C "$WT" rev-parse --show-toplevel)" != "$WT" ]; then
  echo "task directory is not the root of a worktree: $WT" >&2
  exit 2
fi
if [ "$(git -C "$WT" symbolic-ref --quiet --short HEAD || true)" != "codex/$SLUG" ]; then
  echo "task worktree must be on branch codex/$SLUG" >&2
  exit 2
fi
[ -f "$PROMPT" ] || { echo "prompt file not found: $PROMPT" >&2; exit 2; }
# /tmp and $TMPDIR are not writable; each task gets its own temp dir next to the worktrees.
TASK_TMP="$(dirname "$WT")/.tmp/$SLUG"
case "$TASK_TMP" in *[\"\\]*) echo "unsupported characters in path: $TASK_TMP" >&2; exit 2 ;; esac
mkdir -p "$TASK_TMP"
# Credentials Codex does not need are removed; the prompt is read from a file, never evaluated.
env -u GITHUB_TOKEN -u GH_TOKEN -u ANTHROPIC_API_KEY TMPDIR="$TASK_TMP" \
  codex exec --sandbox workspace-write --ephemeral -C "$WT" \
  -c 'sandbox_workspace_write.network_access=false' \
  -c 'sandbox_workspace_write.exclude_slash_tmp=true' \
  -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' \
  -c "sandbox_workspace_write.writable_roots=[\"$TASK_TMP\"]" \
  -o "$OUT" - < "$PROMPT"
git -C "$WT" status --short
