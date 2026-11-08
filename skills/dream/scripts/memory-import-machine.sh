#!/usr/bin/env bash
# Attach this machine's existing memory directory to the shared memory repo.
#
# Usage: memory-import-machine.sh [--apply]
#
# The danger this guards against: machines have DIVERGENT memory. A naive
# "git init, add, push" would make whichever machine imports last overwrite
# MEMORY.md with its own smaller copy. So the local snapshot is committed first
# and then MERGED with the remote using the union drivers, which keeps both
# sides' entries. Nothing is force-pushed and nothing is deleted.
#
# A timestamped backup of the memory dir is taken before anything changes.
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

MEM_DIR="${PI_MEMORY_DIR:-$HOME/.pi/agent/memory}"
REMOTE="${PI_MEMORY_REMOTE:-git@github.com:huaxel/pi-memory.git}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

[[ -d "$MEM_DIR" ]] || { echo "no memory dir: $MEM_DIR" >&2; exit 1; }
cd "$MEM_DIR" || exit 1

if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "already a git repo; use memory-sync.sh instead"
  exit 1
fi

echo "memory dir: $MEM_DIR"
echo "remote:     $REMOTE"
echo "local files: $(find . -type f -not -path './.git/*' | wc -l | tr -d ' ')"
echo "MEMORY.md:   $(wc -c < MEMORY.md 2>/dev/null | tr -d ' ') bytes"

if (( ! APPLY )); then
  echo
  echo "DRY RUN. Would:"
  echo "  1. back up to $MEM_DIR.backup-<timestamp>"
  echo "  2. git init, commit the local snapshot"
  echo "  3. fetch $REMOTE and merge with union drivers"
  echo "  4. push the merged result"
  echo "Re-run with --apply."
  exit 0
fi

BACKUP="$MEM_DIR.backup-$(date +%Y%m%d-%H%M%S)"
cp -a "$MEM_DIR" "$BACKUP" || { echo "backup failed; aborting" >&2; exit 1; }
echo "backup: $BACKUP"

# Local snapshot first, so the merge has two real sides.
git init -q -b main .
printf 'recovery/\ndream/pending/\ndream/processed/\ndream/*.log\ndream/last-run\n**/.src-*\n.DS_Store\n' > .gitignore
# The merge drivers are chosen from .gitattributes in the WORKING TREE at merge
# time. Without this file on the local side, git falls back to a line merge and
# add/add daily logs conflict (observed: 5 conflicts on the first attempt).
# `**/daily/*.md` covers per-project memory dirs (projects/<hash>/daily/), which
# a plain `daily/*.md` rule misses.
printf 'MEMORY.md merge=memory-index\nSCRATCHPAD.md merge=memory-index\n**/daily/*.md merge=memory-index\n.gitignore merge=union\n' > .gitattributes
git add -A
python3 "$SKILL_DIR/scripts/check-memory-privacy.py"
git -c user.email="$(git config --global user.email || echo memory@localhost)" \
    -c user.name="$(git config --global user.name || echo memory)" \
    commit -q -m "memory: local snapshot from $(hostname -s)" || true

# Three-way driver: union additions, preserve deletions, stop on conflicts.
# The driver path must exist on THIS machine; a wrong path makes git fall back
# to a line merge and conflict (observed on the first two attempts).
DRIVER="$SKILL_DIR/scripts/merge-memory-index.py"
[[ -x "$DRIVER" ]] || { echo "merge driver not found at $DRIVER" >&2; exit 1; }
python3 "$SKILL_DIR/scripts/configure-memory-merge.py" || exit 1

git remote add origin "$REMOTE" 2>/dev/null || git remote set-url origin "$REMOTE"
git fetch -q origin

# Config files are canonical on the remote, not mergeable content. If
# .gitattributes itself conflicts, git writes conflict markers into it and then
# cannot parse its own attributes, which silently disables every merge rule
# (observed: MEMORY.md, SCRATCHPAD.md and all dailies fell back to line merges).
git checkout origin/main -- .gitattributes .gitignore 2>/dev/null || true
# Commit it, or the merge refuses to run over a dirty tree.
git -c user.email="$(git config --global user.email || echo memory@localhost)" \
    -c user.name="$(git config --global user.name || echo memory)" \
    commit -q -m "memory: adopt canonical merge config" || true

echo "merging remote history (union drivers keep both sides)"
if ! git -c user.email="$(git config --global user.email || echo memory@localhost)" \
         -c user.name="$(git config --global user.name || echo memory)" \
         merge --allow-unrelated-histories --no-edit origin/main; then
  git merge --abort 2>/dev/null || true
  echo "MERGE CONFLICT. Nothing was pushed. Your original memory is intact at:" >&2
  echo "  $BACKUP" >&2
  echo "Resolve by hand, or restore with: rm -rf '$MEM_DIR' && mv '$BACKUP' '$MEM_DIR'" >&2
  exit 1
fi

python3 "$SKILL_DIR/scripts/check-memory-privacy.py" --against origin/main
echo "pushing inspected branch"
if ! git push --no-follow-tags -u origin main; then
  echo "push failed; the merge is local and safe. Retry with memory-sync.sh" >&2
  exit 1
fi

echo "done. MEMORY.md is now $(wc -c < MEMORY.md | tr -d ' ') bytes"
echo "backup kept at $BACKUP (delete once you have verified the result)"
