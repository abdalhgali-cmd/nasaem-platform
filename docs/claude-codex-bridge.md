# Claude Code ↔ Codex CLI bridge

This repository includes project-scoped MCP configuration for the third-party
[claude-codex-bridge](https://github.com/Dunqing/claude-codex-bridge).
This config allows each CLI to request code reviews, explanations, or tasks
from the other **when both CLIs are installed and authenticated in the same
working environment**.

## What is configured

| Direction | Project file | MCP server |
| --- | --- | --- |
| Claude Code → Codex CLI | `.mcp.json` | `codex` |
| Codex CLI → Claude Code | `.codex/config.toml` | `claude` |

- Both use `npx -y claude-codex-bridge@0.3.1` with the corresponding `serve` command.
- The pre-existing NotebookLM MCP server in `.mcp.json` remains unchanged.
- Codex applies project-scoped config only when you trust the project.
- This is **not** a GitHub Action, hosted service, or integration between the
  ChatGPT and Claude web/mobile chat apps. Committing configuration does not
  install CLIs, sign in to them, or start the bridge.

## Use from a phone with GitHub Codespaces

1. On GitHub open the `nasaem-platform` repository and launch or resume a
   Codespace on the branch containing these changes (after merge, `main`).
   Codespaces provides a browser-based terminal, including from a phone.
2. In that terminal, check:
   ```bash
   node --version
   claude --version
   codex --version
   ```
   Install missing tools using the **official** installation instructions:
   [Claude Code](https://code.claude.com/docs/en/overview) and
   [Codex CLI](https://developers.openai.com/codex/cli).
   Node.js must be 18 or newer.
3. Authenticate both CLIs with your own accounts in that environment. Keep
   credentials in the environment or supported secret storage, **never** in
   git-tracked files. The bridge does not provide account access or credits.
4. Trust this project in Codex if prompted. Restart both CLIs from the
   repository root so they can read the project configuration.
5. Check the registered servers:
   ```bash
   claude mcp list
   codex mcp list
   ```
   Expect `codex` in Claude's list and `claude` in Codex's list. This only
   confirms registration; test a read-only tool call to verify actual operation.
6. In Claude Code, try: **Ask Codex to review my latest changes without
   modifying files.**
   In Codex, try: **Ask Claude to review my plan without modifying files.**

## Security and workflow

- This MCP bridge is an **independent third-party project**. Review the
  upstream code and dependency risks before first execution. Version `0.3.1`
  is intentionally pinned; updating it requires a reviewed change.
- `npx` downloads and runs the package when called if it is not cached.
  Both tools must have the right environment/network access.
- Prefer read-only analysis first. Before delegating editing, agree on which
  tool owns each file; use feature branches and PRs to review code. Never
  delegate destructive shell commands or expose secrets to either model.
- This change affects only developer tooling; it does not alter the
  running customer website, staff panel, backend, or Android application.
- If the bridge cannot start, confirm both CLIs are available on the same
  `PATH`, signed in, and that the environment can access npm. Check the
  project trust state and MCP diagnostics.

## Upstream references

- [Bridge source and setup](https://github.com/Dunqing/claude-codex-bridge)
- [Codex project configuration](https://developers.openai.com/codex/config-basic)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
