#!/usr/bin/env bash
# Action: capture the current pane's agent session into the fork clipboard, to be
# pasted into another pane later (see paste.sh). Reusable — paste as many times
# as you like; copying again replaces the clipboard. Nothing is opened here.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
. "$here/common.sh"

if ! have_jq; then
  echo "herdr-fork: 'jq' is required but was not found on PATH." >&2
  notify "Fork copy" "'jq' is required but is not installed."
  exit 1
fi

pane_id="$(resolve_pane_id || true)"
if [ -z "${pane_id:-}" ]; then
  echo "herdr-fork: could not determine the current pane." >&2
  notify "Fork copy" "Could not determine the current pane."
  exit 1
fi

pane_json="$("$(herdr_bin)" pane get "$pane_id" 2>/dev/null || true)"
if [ -z "$pane_json" ]; then
  echo "herdr-fork: 'herdr pane get $pane_id' returned no data." >&2
  notify "Fork copy" "Could not read pane $pane_id."
  exit 1
fi

IFS=$'\t' read -r agent value cwd < <(extract_fork_target "$pane_json")

if [ -z "${value:-}" ]; then
  echo "herdr-fork: pane $pane_id has no forkable agent session." >&2
  notify "Fork copy" "This pane has no forkable agent session yet."
  exit 1
fi

reg="$(register_file)"
mkdir -p "$(state_dir)"
chmod 700 "$(state_dir)" 2>/dev/null || true

umask 077
jq -n --arg agent "$agent" --arg value "$value" --arg cwd "$cwd" \
  '{agent: $agent, value: $value, cwd: $cwd}' >"$reg"

notify "Fork copied" "${agent:-agent} session ready to paste."
echo "herdr-fork: copied ${agent:-agent} session — paste it into another pane." >&2
