"""GitHub Actions runner for AI Dev Orchestra. No user value is passed to a shell."""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def run(args, cwd, *, input_text=None, env=None, timeout=1800):
    return subprocess.run(args, cwd=cwd, input=input_text, text=True, capture_output=True,
                          check=False, timeout=timeout, env=env)


def event(kind, message):
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write(f"\n### {kind}\n\n{message}\n")


def result(status, summary="", review="", error=""):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as out:
            out.write(f"\n## AI Dev Orchestra result: {status}\n\n")
            out.write("The run ended without publishing agent transcript content. Check the dashboard for the branch and current status.\n")


def git(args, cwd, *, env=None, check=True):
    proc = run(["git", *args], cwd, env=env, timeout=180)
    if check and proc.returncode:
        raise RuntimeError("Git could not complete the requested safe operation")
    return proc


def make_askpass(task_id):
    path = Path(tempfile.gettempdir()) / ("orchestra-askpass-" + task_id + ".py")
    path.write_text("#!/usr/bin/env python3\nimport os,sys\nprint('x-access-token' if 'Username' in sys.argv[-1] else os.environ['GITHUB_TOKEN'])\n", encoding="utf-8")
    path.chmod(0o700)
    env = os.environ.copy()
    env.update({"GIT_ASKPASS": str(path), "GIT_TERMINAL_PROMPT": "0"})
    env.pop("GH_TOKEN", None)
    return path, env


def review_with_codex(worktree, diff, task):
    prompt = f"""You are the read-only reviewer for AI Dev Orchestra. Review the implementation against the task.
Do not edit files. Look for correctness, security, regressions, missing tests, and scope problems.
If changes are required, begin the final response with exactly ORCHESTRA_REVIEW: CHANGES_REQUESTED and give actionable findings.
If it is safe and meets the task, begin the final response with exactly ORCHESTRA_REVIEW: APPROVED and briefly explain why.
If you are uncertain, request changes. Never claim tests were run unless the diff proves it.

TASK TITLE: {task['title']}
TASK:
{task['prompt']}

PATCH:
{diff}
"""
    output = Path(tempfile.gettempdir()) / ("orchestra-review-" + task["task_id"] + ".txt")
    # Read-only sandbox prevents edits; approval prompts are irrelevant for this
    # mode and the --ask-for-approval flag is not supported by all current CLIs.
    args = ["codex", "exec", "--sandbox", "read-only",
            "--output-last-message", str(output), "-"]
    review_env = os.environ.copy()
    for key in ["GITHUB_TOKEN", "GH_TOKEN", "ANTHROPIC_API_KEY"]:
        review_env.pop(key, None)
    proc = run(args, worktree, input_text=prompt, env=review_env, timeout=1800)
    if proc.returncode:
        return "", "Codex CLI failed; review is not approved."
    return (output.read_text(encoding="utf-8", errors="replace") if output.exists() else proc.stdout), ""


def main():
    names = ["TASK_ID", "TASK_TITLE", "TASK_PROMPT", "BASE_BRANCH", "TASK_BRANCH"]
    if any(not os.environ.get(key) for key in names):
        raise RuntimeError("Required task inputs are missing")
    if not os.environ.get("ANTHROPIC_API_KEY") or not os.environ.get("OPENAI_API_KEY"):
        result("needs_attention", error="Configure ANTHROPIC_API_KEY and OPENAI_API_KEY in repository Actions secrets.")
        return 1
    task_id, title = os.environ["TASK_ID"], os.environ["TASK_TITLE"]
    base, branch = os.environ["BASE_BRANCH"], os.environ["TASK_BRANCH"]
    prompt_text = os.environ["TASK_PROMPT"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,99}", base) or ".." in base:
        raise RuntimeError("Invalid base branch")
    if not re.fullmatch(r"orchestra/[a-z0-9-]{1,32}-[a-f0-9]{8}", branch):
        raise RuntimeError("Invalid task branch")
    repo_root = Path(os.environ["GITHUB_WORKSPACE"]).resolve()
    worktree = Path(tempfile.gettempdir()) / ("orchestra-task-" + task_id)
    askpass, git_env = make_askpass(task_id)
    event("running", "GitHub Actions created an isolated task workspace; Claude is implementing the request.")
    git(["fetch", "origin", base], repo_root, env=git_env)
    git(["worktree", "add", "--track", "-b", branch, str(worktree), "origin/" + base], repo_root, env=git_env)
    safe_env = os.environ.copy()
    for key in ["GITHUB_TOKEN", "GH_TOKEN", "OPENAI_API_KEY"]:
        safe_env.pop(key, None)
    implementation = ""
    review = ""
    max_revisions = 2
    for attempt in range(max_revisions + 1):
        if attempt == 0:
            claude_prompt = "Implement the task in the current repository. Follow existing project conventions. Do not run shell commands. Do not access credentials or make network calls. Make only the requested code changes and summarize the work.\n\nTASK:\n" + prompt_text
        else:
            claude_prompt = "Revise your implementation using the Codex reviewer findings below. Keep scope limited to the task. Do not run shell commands.\n\nTASK:\n" + prompt_text + "\n\nCODEX FINDINGS:\n" + review
        claude = run(["claude", "-p", "--permission-mode", "acceptEdits", "--restricted",
                      "--tools", "Read,Edit,Write,Glob,Grep", "--permission-prompts", "none",
                      "--max-turns", "18"], worktree, input_text=claude_prompt, env=safe_env)
        if claude.returncode:
            result("failed", error="Claude Code could not complete the task. Check the GitHub Actions log for the CLI error.")
            return 1
        implementation = claude.stdout[-12000:]
        staged = git(["add", "--all", "--"], worktree, check=False)
        if staged.returncode:
            raise RuntimeError("Unable to prepare the review diff")
        diff = git(["diff", "--cached", "--no-ext-diff", "--no-color", "--unified=3"], worktree).stdout
        if not diff.strip():
            result("needs_attention", implementation, "No changes were produced; nothing was pushed.")
            return 0
        event("reviewing", f"Codex is reviewing the read-only patch (round {attempt + 1}).")
        review, error = review_with_codex(worktree, diff[-100000:], {"task_id": task_id, "title": title, "prompt": prompt_text})
        if error:
            result("needs_attention", implementation, error)
            return 0
        if re.search(r"(?m)^ORCHESTRA_REVIEW:\s*APPROVED\s*$", review) and not re.search(r"(?m)^ORCHESTRA_REVIEW:\s*CHANGES_REQUESTED\s*$", review):
            break
        if attempt == max_revisions:
            result("needs_attention", implementation, review or "Codex did not return a clear approval marker.")
            return 0
        event("revision", f"Codex requested changes; Claude will make revision {attempt + 1} of {max_revisions}.")
    # GitHub credentials are added only after Codex has explicitly approved.
    staged = git(["add", "--all", "--"], worktree, check=False)
    if staged.returncode or git(["diff", "--cached", "--quiet"], worktree, check=False).returncode == 0:
        result("needs_attention", implementation, review + "\nNo staged changes were available to publish.")
        return 0
    git(["config", "user.name", "AI Dev Orchestra"], worktree)
    git(["config", "user.email", "ai-dev-orchestra@users.noreply.github.com"], worktree)
    git(["commit", "-m", "AI Dev Orchestra: " + title[:72]], worktree)
    event("push", "Codex approved the patch; publishing the task branch without force-push.")
    origin = git(["remote", "get-url", "origin"], repo_root).stdout.strip()
    pushed = git(["push", origin, "HEAD:refs/heads/" + branch], worktree, env=git_env, check=False)
    if pushed.returncode:
        result("failed", implementation, review, "Codex approved, but GitHub rejected the branch push. Check repository permissions and branch protection.")
        return 1
    result("complete", implementation, review)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        try:
            result("failed", error="Runner stopped safely: " + str(exc)[:400])
        except Exception:
            pass
        print("AI Dev Orchestra runner failed; see the workflow log for diagnostic details.", file=sys.stderr)
        raise SystemExit(1)

