#!/usr/bin/env bash
# Dream pass runner — headless pi session over the memory system.
# Usage: scripts/dream.sh           (model: pi default, or PI_DREAM_MODEL="provider/model")
# Scheduled weekly via com.juanbenjumea.pi-dream.plist.
set -uo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/.pi/agent/memory/dream"
LOCK_DIR="/tmp/pi-dream.lock"
mkdir -p "$LOG_DIR"

# --- single-instance lock (break stale locks after 3h) ---
if mkdir "$LOCK_DIR" 2>/dev/null; then
  echo $$ >"$LOCK_DIR/pid"
else
  pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "dream: another pass is running (pid $pid); exiting." >&2
    exit 0
  elif (( lock_age < 10800 )); then
    echo "dream: recent lock without live process (age ${lock_age}s); exiting to be safe." >&2
    exit 0
  fi
  rm -rf "$LOCK_DIR" && mkdir "$LOCK_DIR" && echo $$ >"$LOCK_DIR/pid"
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

STAMP="$(date +%F)"
RUN_LOG="$LOG_DIR/run-$STAMP.log"

MODEL_ARGS=()
if [[ -n "${PI_DREAM_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$PI_DREAM_MODEL")
fi

{
  echo "=== dream pass $STAMP ==="
  pi -p --no-session "${MODEL_ARGS[@]}" \
    "Read $SKILL_DIR/SKILL.md and execute the dream pass it describes, in full, now. Write the dream log as instructed."
  echo "=== pi exited $? ==="
} >>"$RUN_LOG" 2>&1

# Make memory + vault changes searchable (covers direct file edits the
# in-session debounced updater may not have flushed).
qmd update >>"$RUN_LOG" 2>&1 || true
qmd embed >>"$RUN_LOG" 2>&1 || true
echo "=== dream done $STAMP ===" >>"$RUN_LOG"
