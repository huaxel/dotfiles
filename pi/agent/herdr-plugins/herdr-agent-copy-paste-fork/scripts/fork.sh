#!/usr/bin/env bash
# Action entrypoint. Reads the current pane's agent session reference and opens a
# new pane (tab or split, per the placement flags passed in the manifest) that
# resumes that session as a fresh branch. The original conversation is never
# touched.
#
# Placement flags for `herdr plugin pane open` are forwarded verbatim, e.g.
#   fork.sh --placement tab
#   fork.sh --placement split --direction right
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
. "$here/common.sh"

if ! have_jq; then
  echo "herdr-fork: 'jq' is required but was not found on PATH." >&2
  notify "Fork" "'jq' is required but is not installed."
  exit 1
fi

pane_id="$(resolve_pane_id || true)"
if [ -z "${pane_id:-}" ]; then
  echo "herdr-fork: could not determine the current pane." >&2
  notify "Fork" "Could not determine the current pane."
  exit 1
fi

pane_json="$("$(herdr_bin)" pane get "$pane_id" 2>/dev/null || true)"
if [ -z "$pane_json" ]; then
  echo "herdr-fork: 'herdr pane get $pane_id' returned no data." >&2
  notify "Fork" "Could not read pane $pane_id."
  exit 1
fi

# The agent_session object rides along on pane.get / agent.get when Herdr has a
# stored native session reference. Pull it out wherever it is nested.
session="$(printf '%s' "$pane_json" \
  | jq -c '[.. | objects | .agent_session? // empty | select(type=="object")][0] // empty')"

if [ -z "$session" ] || [ "$session" = "empty" ] || [ "$session" = "null" ]; then
  echo "herdr-fork: pane $pane_id has no forkable agent session." >&2
  notify "Fork" "This pane has no forkable agent session yet."
  exit 1
fi

value="$(printf '%s' "$session" | jq -r '.value // empty')"
agent="$(printf '%s' "$session" | jq -r '.agent // empty')"
if [ -z "$agent" ]; then
  agent="$(printf '%s' "$pane_json" \
    | jq -r '[.. | objects | .agent? // empty | select(type=="string")][0] // empty')"
fi
cwd="$(printf '%s' "$pane_json" \
  | jq -r '[.. | objects | .foreground_cwd? // empty | select(type=="string")][0] // empty')"

if [ -z "$value" ]; then
  echo "herdr-fork: agent session has no resume value." >&2
  notify "Fork" "This agent session cannot be resumed."
  exit 1
fi

# Hand the fork parameters straight to the new pane via --env. No shared state
# files, so there is no race even if several forks fire at once.
#
# Deliberately NOT using --cwd: the pane command is `bash scripts/launch.sh`, a
# path relative to the plugin root. --cwd would start the pane elsewhere and bash
# could not find the script. launch.sh chdirs into HERDR_FORK_CWD itself.
plugin_id="${HERDR_PLUGIN_ID:-herdr-plugins.fork}"
cwd_args=()
if [ -n "$cwd" ]; then
  cwd_args=(--env "HERDR_FORK_CWD=$cwd")
fi
handoff_args=()
if [ -n "${PI_HERDR_FORK_TOKEN:-}" ]; then
  handoff_args+=(--env "PI_HERDR_FORK_TOKEN=$PI_HERDR_FORK_TOKEN")
fi
if [ -n "${PI_HERDR_FORK_PROMPT:-}" ]; then
  handoff_args+=(--env "PI_HERDR_FORK_PROMPT=$PI_HERDR_FORK_PROMPT")
fi

if ! "$(herdr_bin)" plugin pane open \
  --plugin "$plugin_id" \
  --entrypoint session \
  --env "HERDR_FORK_AGENT=$agent" \
  --env "HERDR_FORK_VALUE=$value" \
  "${cwd_args[@]}" \
  "${handoff_args[@]}" \
  "$@" >/dev/null 2>&1; then
  echo "herdr-fork: failed to open a fork pane." >&2
  notify "Fork" "Failed to open a new pane."
  exit 1
fi
