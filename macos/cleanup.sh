#!/usr/bin/env bash
# macOS cleanup — reclaim disk from regenerable caches and dev cruft.
#
# Default run is SAFE: only things that auto-regenerate (caches, package-manager
# stores, stale launch agents). Reviewable/destructive items are printed, not
# run, unless you pass AGGRESSIVE=1.
#
# Usage:
#   ./macos/cleanup.sh           # safe wins (~9-10 GiB, zero data loss)
#   AGGRESSIVE=1 ./macos/cleanup.sh   # also Claude VM bundles + Playwright (~7 GiB more)
#   DRY_RUN=1 ./macos/cleanup.sh  # print what would run, do nothing
set -uo pipefail

[ "$(uname -s)" = "Darwin" ] || { echo "Not macOS — skipping."; exit 0; }

DRY_RUN="${DRY_RUN:-0}"
AGGRESSIVE="${AGGRESSIVE:-0}"

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] $*"
  else
    echo "  → $*"
    eval "$@"
  fi
}

echo "🧹 macOS cleanup (safe mode${AGGRESSIVE:+, aggressive=$AGGRESSIVE})"
echo "    before: $(df -h / | awk 'NR==2{print $4" free"}')"

# --- 1. Regenerable user caches -------------------------------------------
echo "1) User caches (auto-regenerate)…"
for c in zen CloudKit com.apple.bookassetd; do
  [ -d "$HOME/Library/Caches/$c" ] && run "rm -rf \"$HOME/Library/Caches/$c\""
done

# --- 2. Homebrew cache -----------------------------------------------------
if command -v brew &>/dev/null; then
  echo "2) Homebrew cache…"
  run "brew cleanup -s"
  cache_dir="$(brew --cache 2>/dev/null)"
  [ -n "$cache_dir" ] && [ -d "$cache_dir" ] && run "rm -rf \"$cache_dir\""
fi

# --- 3. JS package-manager stores -----------------------------------------
echo "3) npm / pnpm stores…"
command -v npm  &>/dev/null && run "npm cache clean --force"
command -v pnpm &>/dev/null && run "pnpm store prune"
[ -d "$HOME/Library/Caches/pnpm" ] && run "rm -rf \"$HOME/Library/Caches/pnpm\""

# --- 4. Stray files dumped in /Applications -------------------------------
echo "4) Stray non-app files in /Applications…"
for f in "/Applications/.DS_Store" "/Applications/Flow.csv" "/Applications/Flow.txt"; do
  [ -f "$f" ] && run "rm -f \"$f\""
done
# Large stray screen recording → move to Desktop rather than delete.
shopt -s nullglob
for mov in /Applications/Screen\ Recording*.mov; do
  run "mv \"$mov\" \"$HOME/Desktop/\""
done
shopt -u nullglob

# --- 5. Stale Dropbox launch agents (Dropbox was uninstalled) -------------
echo "5) Stale Dropbox launch agents…"
for la in com.dropbox.DropboxUpdater.wake com.dropbox.dropboxmacupdate.xpcservice; do
  plist="$HOME/Library/LaunchAgents/$la.plist"
  if [ -f "$plist" ]; then
    run "launchctl unload \"$plist\" 2>/dev/null || true"
    run "rm -f \"$plist\""
  fi
done

# --- Aggressive (review-first) --------------------------------------------
if [ "$AGGRESSIVE" = "1" ]; then
  echo "6) Aggressive: Claude VM bundles + Playwright (will re-provision/re-download)…"
  if pgrep -x "Claude" >/dev/null 2>&1; then
    echo "   ⚠️  Claude is running — quit it first to clear vm_bundles. Skipping."
  else
    for d in "vm_bundles" "Cache"; do
      target="$HOME/Library/Application Support/Claude/$d"
      [ -d "$target" ] && run "rm -rf \"$target\""
    done
  fi
  for d in ms-playwright ms-playwright-go; do
    [ -d "$HOME/Library/Caches/$d" ] && run "rm -rf \"$HOME/Library/Caches/$d\""
  done
else
  cat <<'EOF'

ℹ️  Review-first items NOT run (re-run with AGGRESSIVE=1 if you want them):
   - ~/Library/Application Support/Claude/vm_bundles  (~7 GiB; quit Claude first; re-provisions VMs)
   - ~/Library/Caches/ms-playwright*                  (~1.1 GiB; re-downloads browsers)
   - node_modules sweep across ~/projects             (use: npx npkill)
   - Minecraft/PrismLauncher (~3.9 GiB), WhatsApp media (4.1 GiB) — only you can judge
EOF
fi

echo ""
echo "✅ Cleanup done. after: $(df -h / | awk 'NR==2{print $4" free"}')"
