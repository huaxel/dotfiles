# Shared helpers for herdr-fork. Sourced by fork.sh and launch.sh.
# Not meant to be executed directly.

herdr_bin() {
  printf '%s' "${HERDR_BIN_PATH:-herdr}"
}

have_jq() {
  command -v jq >/dev/null 2>&1
}

# Resolve the pane the action was invoked from. Prefer the explicit env var,
# then fall back to the several shapes the context JSON can take.
resolve_pane_id() {
  local pane ctx
  pane="$(printf '%s' "${HERDR_PANE_ID:-}" | tr -d '[:space:]')"
  if [ -n "$pane" ]; then
    printf '%s' "$pane"
    return 0
  fi

  ctx="${HERDR_PLUGIN_CONTEXT_JSON:-}"
  if [ -n "$ctx" ] && have_jq; then
    pane="$(printf '%s' "$ctx" | jq -r '
      .focused_pane_id
      // .pane_id
      // .focused_pane.pane_id
      // .pane.pane_id
      // .context.pane_id
      // empty' 2>/dev/null || true)"
    pane="$(printf '%s' "$pane" | tr -d '[:space:]')"
    if [ -n "$pane" ]; then
      printf '%s' "$pane"
      return 0
    fi
  fi

  return 1
}

# Best-effort desktop notification; never fatal.
notify() {
  "$(herdr_bin)" notification show "$1" --body "$2" >/dev/null 2>&1 || true
}

# Durable location for the fork clipboard. copy.sh writes it; paste.sh reads it.
# Herdr supplies HERDR_PLUGIN_STATE_DIR at runtime; fall back for local tests.
state_dir() {
  printf '%s' "${HERDR_PLUGIN_STATE_DIR:-${TMPDIR:-/tmp}/herdr-fork-state}"
}

register_file() {
  printf '%s/clipboard.json' "$(state_dir)"
}

# Extract the fork target from a `herdr pane get` JSON blob. Prints three
# tab-separated fields — agent, resume value, cwd — with a trailing newline so
# callers can `read` them without tripping set -e. Any field may be empty.
extract_fork_target() {
  local pane_json="$1" session agent value cwd
  # agent_session rides along on pane.get when Herdr has a stored native
  # session reference. Pull it out wherever it happens to be nested.
  session="$(printf '%s' "$pane_json" \
    | jq -c '[.. | objects | .agent_session? // empty | select(type=="object")][0] // empty')"

  agent=""
  value=""
  if [ -n "$session" ] && [ "$session" != "empty" ] && [ "$session" != "null" ]; then
    value="$(printf '%s' "$session" | jq -r '.value // empty')"
    agent="$(printf '%s' "$session" | jq -r '.agent // empty')"
  fi
  if [ -z "$agent" ]; then
    agent="$(printf '%s' "$pane_json" \
      | jq -r '[.. | objects | .agent? // empty | select(type=="string")][0] // empty')"
  fi
  cwd="$(printf '%s' "$pane_json" \
    | jq -r '[.. | objects | .foreground_cwd? // empty | select(type=="string")][0] // empty')"

  printf '%s\t%s\t%s\n' "$agent" "$value" "$cwd"
}

# `codex fork` wants a session UUID. If handed a rollout path, recover the UUID
# from it; otherwise return the value unchanged.
codex_uuid() {
  local value="$1" uuid
  uuid="$(printf '%s' "$value" \
    | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
    | head -1 || true)"
  printf '%s' "${uuid:-$value}"
}
