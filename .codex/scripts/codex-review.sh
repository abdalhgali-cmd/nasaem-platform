#!/usr/bin/env bash
# Independent read-only Codex review: a fresh process that is never resumed and has no write access.
# Usage: codex-review.sh <worktree-dir> <prompt-file> <output-file>
set -euo pipefail
if [ "$#" -ne 3 ]; then
  echo "usage: $0 <worktree-dir> <prompt-file> <output-file>" >&2
  exit 2
fi
PROMPT="$2"
OUT="$3"
WT="$(cd "$1" 2>/dev/null && pwd -P)" || { echo "directory not found: $1" >&2; exit 2; }
if [ "$(git -C "$WT" rev-parse --is-inside-work-tree 2>/dev/null)" != "true" ]; then
  echo "not a git work tree: $WT" >&2
  exit 2
fi
[ -f "$PROMPT" ] || { echo "prompt file not found: $PROMPT" >&2; exit 2; }
# Credentials Codex does not need are removed; the prompt is read from a file, never evaluated.
exec env -u GITHUB_TOKEN -u GH_TOKEN -u ANTHROPIC_API_KEY \
  codex exec --sandbox read-only --ephemeral -C "$WT" -o "$OUT" - < "$PROMPT"
