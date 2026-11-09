#!/usr/bin/env bash
# Register the read-only memory MCP server with every harness installed here.
#
# The server is stdio-only and reads the local memory clone, so each machine
# registers it against its own checkout. Nothing is served over the network and
# no credential is involved: the tools are search/read/list over Markdown that
# git already synced to this machine.
#
# Usage: install-memory-mcp.sh [--dry-run]
set -uo pipefail

SERVER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/skills/dream/scripts/memory-mcp.py"
NAME="pi-memory"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

say() { printf '%s\n' "$*"; }
run() {
  if (( DRY_RUN )); then
    say "would run: $*"
  else
    "$@"
  fi
}

[[ -f "$SERVER" ]] || { say "install-memory-mcp: missing $SERVER" >&2; exit 1; }
chmod +x "$SERVER" 2>/dev/null || true

# Refuse to register a server that cannot answer its own selftest, so a broken
# checkout never becomes a silently failing MCP server.
if ! python3 "$SERVER" --selftest >/dev/null 2>&1; then
  say "install-memory-mcp: selftest failed; not registering" >&2
  exit 1
fi
say "selftest ok"

registered=0

# Claude Code: user scope, so it applies in every project.
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q "^${NAME}:"; then
    say "claude: already registered"
  else
    if run claude mcp add --scope user "$NAME" -- python3 "$SERVER" >/dev/null 2>&1; then
      say "claude: registered"
    else
      say "claude: registration failed"
    fi
  fi
  registered=1
fi

# Codex CLI: global config. Note that Codex still asks for approval per tool
# call under its default policy; that is a Codex setting, not a server issue.
if command -v codex >/dev/null 2>&1; then
  if codex mcp list 2>/dev/null | grep -q "^${NAME}[[:space:]]"; then
    say "codex: already registered"
  else
    if run codex mcp add "$NAME" -- python3 "$SERVER" >/dev/null 2>&1; then
      say "codex: registered"
    else
      say "codex: registration failed"
    fi
  fi
  registered=1
fi

if (( registered == 0 )); then
  say "no supported harness found (claude, codex); nothing to do"
fi

say "server: $SERVER"
