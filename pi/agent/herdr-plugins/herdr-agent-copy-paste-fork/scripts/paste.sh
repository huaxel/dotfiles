#!/usr/bin/env bash
# Action: start the copied fork session in the CURRENTLY FOCUSED pane by typing
# and running its resume command there (see copy.sh). Intended for a pane sitting
# at a shell prompt. The clipboard is reusable, so this does not clear it.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
. "$here/common.sh"

if ! have_jq; then
  echo "herdr-fork: 'jq' is required but was not found on PATH." >&2
  notify "Fork paste" "'jq' is required but is not installed."
  exit 1
fi

reg="$(register_file)"
if [ ! -f "$reg" ]; then
  echo "herdr-fork: nothing copied yet — use the copy hotkey first." >&2
  notify "Fork paste" "Nothing copied yet."
  exit 1
fi

agent="$(jq -r '.agent // empty' "$reg" 2>/dev/null || true)"
value="$(jq -r '.value // empty' "$reg" 2>/dev/null || true)"
cwd="$(jq -r '.cwd // empty' "$reg" 2>/dev/null || true)"

if [ -z "${value:-}" ]; then
  echo "herdr-fork: the fork clipboard is empty or invalid." >&2
  notify "Fork paste" "The fork clipboard is empty."
  exit 1
fi

pane_id="$(resolve_pane_id || true)"
if [ -z "${pane_id:-}" ]; then
  echo "herdr-fork: could not determine the target pane." >&2
  notify "Fork paste" "Could not determine the target pane."
  exit 1
fi

# Build the resume command for the copied agent. %q keeps values with spaces or
# metacharacters safe when the target shell re-parses the pasted line.
case "$agent" in
  claude | claude-code | claudecode)
    cmd="claude --resume $(printf '%q' "$value") --fork-session"
    ;;
  codex)
    cmd="codex fork $(printf '%q' "$(codex_uuid "$value")")"
    ;;
  pi | pi-coding-agent)
    cmd="pi --fork $(printf '%q' "$value")"
    ;;
  *)
    echo "herdr-fork: unknown agent '${agent:-<none>}' in the clipboard." >&2
    notify "Fork paste" "Unknown agent in the clipboard."
    exit 1
    ;;
esac

# Fork in the original project directory so the branch sees the same files.
if [ -n "${cwd:-}" ]; then
  cmd="cd $(printf '%q' "$cwd") && $cmd"
fi

# `pane run` submits the text plus Enter atomically, honoring bracketed paste.
if ! "$(herdr_bin)" pane run "$pane_id" "$cmd" >/dev/null 2>&1; then
  echo "herdr-fork: 'herdr pane run' failed for pane $pane_id." >&2
  notify "Fork paste" "Failed to start the fork in this pane."
  exit 1
fi

echo "herdr-fork: pasted ${agent:-agent} fork into pane $pane_id." >&2
