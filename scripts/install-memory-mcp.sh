#!/usr/bin/env bash
# Register the read-only memory MCP server with every harness installed here.
# Currently Claude Code, Codex CLI, GitHub Copilot CLI, and Cursor.
# Cursor's CLI needs an unlocked login keychain, so it is registered by
# writing ~/.cursor/mcp.json, which the IDE reads directly.
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

# Capture first. A piped `grep -q` exits as soon as it matches, and under
# pipefail the producer's SIGPIPE then looks like "not registered".
has_server() {
  local listing
  listing="$("$@" 2>/dev/null || true)"
  [[ "$listing" == *"$NAME"* ]]
}

# GitHub Copilot CLI: user scope in ~/.copilot/mcp-config.json.
if command -v copilot >/dev/null 2>&1; then
  if has_server copilot mcp list; then
    say "copilot: already registered"
  else
    if run copilot mcp add "$NAME" -- python3 "$SERVER" >/dev/null 2>&1; then
      say "copilot: registered"
    else
      say "copilot: registration failed"
    fi
  fi
  registered=1
fi

# Claude Code: user scope, so it applies in every project.
if command -v claude >/dev/null 2>&1; then
  if has_server claude mcp list; then
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
  if has_server codex mcp list; then
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

# Cursor IDE reads ~/.cursor/mcp.json. The GUI does not inherit a shell PATH,
# so the command is /usr/bin/python3 when that exists (the server is stdlib-only
# and was verified on that interpreter).
register_cursor() {
  local config="$HOME/.cursor/mcp.json" py="/usr/bin/python3"
  [[ -x "$py" ]] || py="python3"
  if (( DRY_RUN )); then
    say "would write $config"
    return 0
  fi
  mkdir -p "$HOME/.cursor"
  "$py" - "$config" "$SERVER" "$py" <<'PY'
import json, pathlib, sys
config, server, py = sys.argv[1:]
path = pathlib.Path(config)
data = {}
if path.exists():
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        print(f"cursor: {config} is not valid JSON ({exc}); left unchanged", file=sys.stderr)
        raise SystemExit(1)
if not isinstance(data, dict):
    print(f"cursor: {config} is not an object; left unchanged", file=sys.stderr)
    raise SystemExit(1)
servers = data.setdefault("mcpServers", {})
if not isinstance(servers, dict):
    print(f"cursor: mcpServers in {config} is not an object; left unchanged", file=sys.stderr)
    raise SystemExit(1)
servers["pi-memory"] = {
    "type": "stdio",
    "command": py,
    "args": [server],
}
path.write_text(json.dumps(data, indent=2) + "\n")
print("cursor: wrote", config)
PY
}
if register_cursor; then
  registered=1
else
  say "cursor: registration failed"
fi

if (( registered == 0 )); then
  say "no supported harness found (claude, codex, copilot, cursor); nothing to do"
fi

say "server: $SERVER"
