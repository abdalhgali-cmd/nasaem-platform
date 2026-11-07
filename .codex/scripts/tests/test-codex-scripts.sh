#!/usr/bin/env bash
# Offline tests for codex-review.sh and codex-implement.sh. A fake `codex` records the exact
# arguments, stdin and environment it receives; no real Codex call or network access is made.
# Usage: bash .codex/scripts/tests/test-codex-scripts.sh
# shellcheck disable=SC2015,SC2016,SC2181  # `check && ok || bad` reporting; literal $(...) in test prompt
set -uo pipefail
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL - $1"; }

# Fake codex: one argument per line in args.txt, stdin in stdin.txt, leaked variables in env.txt.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/codex" <<'EOF'
#!/usr/bin/env bash
: > "$FAKE_LOG/args.txt"
for a in "$@"; do printf '%s\n' "$a" >> "$FAKE_LOG/args.txt"; done
cat > "$FAKE_LOG/stdin.txt"
env | grep -E '^(GITHUB_TOKEN|GH_TOKEN|ANTHROPIC_API_KEY)=' > "$FAKE_LOG/env.txt" || true
env | grep -E '^TMPDIR=' > "$FAKE_LOG/tmpdir.txt" || true
EOF
chmod +x "$TMP/bin/codex"
export PATH="$TMP/bin:$PATH" FAKE_LOG="$TMP/log"
export GITHUB_TOKEN=leak GH_TOKEN=leak ANTHROPIC_API_KEY=leak
mkdir -p "$FAKE_LOG"

git_q() { git -c user.name=t -c user.email=t@example.com "$@" >/dev/null 2>&1; }
ROOT="$TMP/nasaem-platform"
git_q init -b main "$ROOT"
git_q -C "$ROOT" commit --allow-empty -m init
mkdir -p "$TMP/nasaem-tasks"
git_q -C "$ROOT" worktree add -b codex/demo "$TMP/nasaem-tasks/demo"
git_q -C "$ROOT" worktree add -b other "$TMP/nasaem-tasks/wrong-branch"
git_q -C "$ROOT" worktree add --detach "$TMP/nasaem-tasks/detached"
mkdir -p "$TMP/nasaem-tasks/plain-dir"
git_q init -b codex/foreign "$TMP/nasaem-tasks/foreign"
git_q -C "$TMP/nasaem-tasks/foreign" commit --allow-empty -m init
ln -s "$ROOT" "$TMP/nasaem-tasks/link-to-root"
git_q -C "$ROOT" branch codex/link-to-root
printf 'Review this. $(touch %s/pwned) `touch %s/pwned2`\n' "$TMP" "$TMP" > "$TMP/prompt.txt"

expect_exit() { # <name> <expected-code> <command...>
  local name="$1" want="$2"; shift 2
  rm -f "$FAKE_LOG/args.txt"
  "$@" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then ok "$name (exit $got)"; else bad "$name: expected exit $want, got $got"; fi
}
expect_no_codex() { # <name>
  if [ -e "$FAKE_LOG/args.txt" ]; then bad "$1: codex was started"; else ok "$1: codex not started"; fi
}
expect_args() { # <name> <expected args, one per line>
  if [ "$(cat "$FAKE_LOG/args.txt" 2>/dev/null)" = "$2" ]; then ok "$1: exact codex arguments"
  else bad "$1: unexpected codex arguments:"; sed 's/^/       /' "$FAKE_LOG/args.txt" 2>/dev/null; fi
}

REVIEW="$SCRIPTS/codex-review.sh"
IMPL="$SCRIPTS/codex-implement.sh"
OUT="$TMP/out.txt"

echo "# codex-review.sh"
expect_exit "review: no arguments" 2 bash "$REVIEW"; expect_no_codex "review: no arguments"
expect_exit "review: extra argument" 2 bash "$REVIEW" "$ROOT" "$TMP/prompt.txt" "$OUT" --full-auto
expect_no_codex "review: extra argument"
expect_exit "review: missing directory" 2 bash "$REVIEW" "$TMP/nope" "$TMP/prompt.txt" "$OUT"
expect_exit "review: not a git work tree" 2 bash "$REVIEW" "$TMP/nasaem-tasks/plain-dir" "$TMP/prompt.txt" "$OUT"
expect_no_codex "review: not a git work tree"
expect_exit "review: missing prompt" 2 bash "$REVIEW" "$ROOT" "$TMP/none.txt" "$OUT"
expect_exit "review: valid call" 0 bash "$REVIEW" "$TMP/nasaem-tasks/demo" "$TMP/prompt.txt" "$OUT"
expect_args "review: valid call" "$(printf '%s\n' exec --sandbox read-only --ephemeral -C \
  "$(cd "$TMP/nasaem-tasks/demo" && pwd -P)" -o "$OUT" -)"
cmp -s "$FAKE_LOG/stdin.txt" "$TMP/prompt.txt" && ok "review: prompt passed verbatim on stdin" \
  || bad "review: prompt not passed verbatim"
[ -s "$FAKE_LOG/env.txt" ] && bad "review: credentials leaked to codex" || ok "review: credentials removed"
grep -qx -- 'resume' "$FAKE_LOG/args.txt" && bad "review: resume used" || ok "review: no resume"

echo "# codex-implement.sh"
cd "$ROOT" || exit 1
expect_exit "implement: no arguments" 2 bash "$IMPL"; expect_no_codex "implement: no arguments"
expect_exit "implement: extra argument" 2 bash "$IMPL" demo "$TMP/prompt.txt" "$OUT" --full-auto
for slug in "../demo" "Demo" "demo;id" "-demo" "" "demo/x" "$(printf 'a%.0s' {1..42})"; do
  expect_exit "implement: invalid slug '${slug}'" 2 bash "$IMPL" "$slug" "$TMP/prompt.txt" "$OUT"
  expect_no_codex "implement: invalid slug '${slug}'"
done
expect_exit "implement: missing worktree" 2 bash "$IMPL" missing "$TMP/prompt.txt" "$OUT"
expect_exit "implement: plain directory" 2 bash "$IMPL" plain-dir "$TMP/prompt.txt" "$OUT"
expect_no_codex "implement: plain directory"
expect_exit "implement: other repository" 2 bash "$IMPL" foreign "$TMP/prompt.txt" "$OUT"
expect_no_codex "implement: other repository"
expect_exit "implement: symlink to main checkout" 2 bash "$IMPL" link-to-root "$TMP/prompt.txt" "$OUT"
expect_no_codex "implement: symlink to main checkout"
expect_exit "implement: wrong branch" 2 bash "$IMPL" wrong-branch "$TMP/prompt.txt" "$OUT"
expect_exit "implement: detached HEAD" 2 bash "$IMPL" detached "$TMP/prompt.txt" "$OUT"
expect_no_codex "implement: detached HEAD"
expect_exit "implement: missing prompt" 2 bash "$IMPL" demo "$TMP/none.txt" "$OUT"
(cd "$TMP" && bash "$IMPL" demo "$TMP/prompt.txt" "$OUT" >/dev/null 2>&1)
[ "$?" = 2 ] && ok "implement: outside the repository (exit 2)" || bad "implement: ran outside the repository"
expect_exit "implement: valid call" 0 bash "$IMPL" demo "$TMP/prompt.txt" "$OUT"
DEMO="$(cd "$TMP/nasaem-tasks/demo" && pwd -P)"
TASK_TMP="$(dirname "$DEMO")/.tmp/demo"
EXPECTED_IMPL="$(printf '%s\n' exec --sandbox workspace-write --ephemeral -C "$DEMO" \
  -c 'sandbox_workspace_write.network_access=false' \
  -c 'sandbox_workspace_write.exclude_slash_tmp=true' \
  -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' \
  -c "sandbox_workspace_write.writable_roots=[\"$TASK_TMP\"]" -o "$OUT" -)"
expect_args "implement: valid call" "$EXPECTED_IMPL"
[ -d "$TASK_TMP" ] && ok "implement: per-task temp dir created" || bad "implement: per-task temp dir missing"
grep -qx "TMPDIR=$TASK_TMP" "$FAKE_LOG/tmpdir.txt" && ok "implement: TMPDIR points at the task temp dir" \
  || bad "implement: TMPDIR not set to the task temp dir"
cmp -s "$FAKE_LOG/stdin.txt" "$TMP/prompt.txt" && ok "implement: prompt passed verbatim on stdin" \
  || bad "implement: prompt not passed verbatim"
[ -s "$FAKE_LOG/env.txt" ] && bad "implement: credentials leaked to codex" || ok "implement: credentials removed"
grep -qE -- '^(--full-auto|resume|danger-full-access|--dangerously-bypass-approvals-and-sandbox)$' \
  "$FAKE_LOG/args.txt" && bad "implement: forbidden flag present" || ok "implement: no forbidden flags"
(cd "$DEMO" && bash "$IMPL" demo "$TMP/prompt.txt" "$OUT" >/dev/null 2>&1)
[ "$?" = 0 ] && ok "implement: works when started inside the task worktree" \
  || bad "implement: fails inside the task worktree"

[ -e "$TMP/pwned" ] || [ -e "$TMP/pwned2" ] && bad "prompt text was executed" || ok "prompt text never executed"

echo "# $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
