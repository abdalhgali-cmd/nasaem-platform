#!/usr/bin/env bash
# Launches the Codex -> Claude MCP bridge with the argument shim in .codex/bin first on PATH.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HERE/bin:$PATH"
exec npx -y claude-codex-bridge@0.3.1 serve claude
