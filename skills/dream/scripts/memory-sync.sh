#!/usr/bin/env bash
# Sync the pi memory directory across machines through a git remote.
#
# Usage: memory-sync.sh [--pull-only|--push-only]
#
# Order matters:
#   1. pull (so we never merge against stale state)
#   2. stage, then inspect staged Markdown and outgoing commit snapshots
#   3. commit, then recheck (including hook changes)
#   4. push only the inspected branch to its configured upstream
#
# Deletes need no bookkeeping here. Tools that sync a separate mirror into the
# live directory must infer "deleted locally" vs "added remotely" with a
# manifest; we run git directly in the memory directory, so git already knows
# which side deleted a path and reports a modify/delete conflict when it cannot
# decide. Do not add a manifest for a problem this layout does not have.
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

MEM_DIR="${PI_MEMORY_DIR:-$HOME/.pi/agent/memory}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="both"
while (( $# )); do
  case "$1" in
    --pull-only) MODE="pull" ;;
    --push-only) MODE="push" ;;
    *) echo "memory-sync: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$MEM_DIR" || { echo "memory-sync: no such directory: $MEM_DIR" >&2; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "memory-sync: $MEM_DIR is not a git repo" >&2; exit 1; }
git remote | grep -q . || { echo "memory-sync: no git remote configured" >&2; exit 1; }

# Local overrides also replace old daily-log union rules during rebase.
python3 "$SKILL_DIR/scripts/configure-memory-merge.py"
if [[ -n "$(git ls-files -u)" ]]; then
  echo "memory-sync: unresolved index; resolve before syncing" >&2
  exit 1
fi

if [[ "$MODE" != push ]]; then
  echo "memory-sync: pulling"
  if ! git pull --rebase --autostash; then
    echo "memory-sync: pull failed (rebase conflict). Resolve by hand; nothing was committed." >&2
    exit 1
  fi
fi

# Git can return success after a pull whose autostash application conflicts.
# Never stage those conflicts (git add -A would mark them resolved).
if [[ -n "$(git ls-files -u)" ]]; then
  echo "memory-sync: unresolved index after pull; nothing staged or pushed" >&2
  exit 1
fi

if [[ "$MODE" != pull ]]; then
  # Explicit destination prevents push.default=matching or configured push
  # refspecs from publishing branches this gate did not inspect.
  BRANCH=$(git symbolic-ref --quiet --short HEAD)
  PUSH_REMOTE=$(git config --get "branch.$BRANCH.remote")
  PUSH_REF=$(git config --get "branch.$BRANCH.merge")
  [[ -n "$PUSH_REMOTE" && "$PUSH_REF" == refs/heads/* ]] || {
    echo "memory-sync: configure a branch upstream before publishing" >&2
    exit 1
  }
  git add -A
  python3 "$SKILL_DIR/scripts/check-memory-privacy.py"
  if git diff --cached --quiet; then
    echo "memory-sync: nothing to commit"
  else
    git commit -m "memory: sync from $(hostname -s) $(date +%F)" >/dev/null
    echo "memory-sync: committed"
  fi

  python3 "$SKILL_DIR/scripts/check-memory-privacy.py"
  echo "memory-sync: pushing inspected branch"
  if ! git push --no-follow-tags -- "$PUSH_REMOTE" "HEAD:$PUSH_REF"; then
    echo "memory-sync: push failed; the commit is local and will go out next run." >&2
    exit 1
  fi
fi

echo "memory-sync: done ($(git rev-parse --short HEAD))"
