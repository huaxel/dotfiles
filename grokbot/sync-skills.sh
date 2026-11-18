#!/usr/bin/env bash
# Mirror Grok Bot skills (minus Grok Bot's internal .library-fingerprint index) into this repo. Idempotent; deleted skills disappear.
set -euo pipefail
SRC="${GROKBOT_SKILLS_SRC:-/home/box/agent-data/workflows}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skills"
[ -d "$SRC" ] || { echo "source not found: $SRC" >&2; exit 1; }
mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude ".library-fingerprint" "$SRC/" "$DEST/"
else
  # Fallback with the same result as rsync --delete: replace the copy wholesale.
  find "$DEST" -mindepth 1 -delete
  cp -a "$SRC/." "$DEST/"
  rm -f "$DEST/.library-fingerprint"
fi
echo "synced $(find "$DEST" -mindepth 1 -maxdepth 1 -type d | wc -l) skills into $DEST"
