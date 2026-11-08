#!/usr/bin/env bash
# Sync the pi memory directory across machines through a git remote.
#
# Usage: memory-sync.sh [--pull-only|--push-only] [--force]
#
# Order matters:
#   1. pull (so we never merge against stale state)
#   2. scrub gate on daily/ (personal content must not leave the machine)
#   3. add + commit
#   4. push
#
# Deletes need no bookkeeping here. Tools that sync a separate mirror into the
# live directory must infer "deleted locally" vs "added remotely" with a
# manifest; we run git directly in the memory directory, so git already knows
# which side deleted a path and reports a modify/delete conflict when it cannot
# decide. Do not add a manifest for a problem this layout does not have.
set -uo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

MEM_DIR="${PI_MEMORY_DIR:-$HOME/.pi/agent/memory}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="both"; FORCE=0
while (( $# )); do
  case "$1" in
    --pull-only) MODE="pull" ;;
    --push-only) MODE="push" ;;
    --force) FORCE=1 ;;
    *) echo "memory-sync: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$MEM_DIR" || { echo "memory-sync: no such directory: $MEM_DIR" >&2; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "memory-sync: $MEM_DIR is not a git repo" >&2; exit 1; }
git remote | grep -q . || { echo "memory-sync: no git remote configured" >&2; exit 1; }

# The merge driver must be configured locally on every machine; git does not
# carry driver definitions in the repo.
if ! git config --get merge.memory-index.driver >/dev/null; then
  git config merge.memory-index.driver "$SKILL_DIR/scripts/merge-memory-index.py %O %A %B"
  echo "memory-sync: configured merge.memory-index driver"
fi
if [[ ! -f .gitattributes ]] || ! grep -q 'MEMORY.md merge=memory-index' .gitattributes 2>/dev/null; then
  printf 'MEMORY.md merge=memory-index\n' >> .gitattributes
  echo "memory-sync: added MEMORY.md merge rule to .gitattributes"
fi

if [[ "$MODE" != push ]]; then
  echo "memory-sync: pulling"
  if ! git pull --rebase --autostash; then
    echo "memory-sync: pull failed (rebase conflict). Resolve by hand; nothing was committed." >&2
    exit 1
  fi
fi

if [[ "$MODE" != pull ]]; then
  # Fail-closed privacy gate: refuse to push personal content.
  if [[ -d daily ]]; then
    if ! python3 "$SKILL_DIR/scripts/scrub-personal.py" check daily; then
      echo "memory-sync: REFUSING to push, daily logs contain personal content." >&2
      echo "memory-sync: run scrub-personal.py scrub <outdir> daily and review before syncing." >&2
      (( FORCE )) || exit 1
      echo "memory-sync: --force given, continuing anyway" >&2
    fi
  fi

  git add -A
  if git diff --cached --quiet; then
    echo "memory-sync: nothing to commit"
  else
    git commit -m "memory: sync from $(hostname -s) $(date +%F)" >/dev/null
    echo "memory-sync: committed"
  fi

  echo "memory-sync: pushing"
  if ! git push; then
    echo "memory-sync: push failed; the commit is local and will go out next run." >&2
    exit 1
  fi
fi

echo "memory-sync: done ($(git rev-parse --short HEAD))"
