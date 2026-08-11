#!/bin/bash
# Patch pi-tui's kitty keyboard protocol modifier decoding (pi 0.84.1 bug).
#
# Symptom: ctrl+alt+g / ctrl+alt+n (go-on), ctrl+shift+r (restart),
# ctrl+. (answer) and every modified chord stop working on kitty-protocol
# terminals (Ghostty, kitty, WezTerm, iTerm2, recent VTE/GNOME Terminal,
# Windows Terminal with kitty support).
#
# Cause: kitty CSI-u sequences carry bitmask modifiers (shift=1, alt=2,
# ctrl=4 -> ctrl+alt=6), but parseKittySequence() subtracted 1 (the xterm
# convention where ctrl+alt=7). The decoder then compared 5 against the
# expected 6 and never matched. The modifyOtherKeys fallback path is
# deliberately left untouched (xterm-style there is correct).
#
# Re-run after every pi update (idempotent). Also report upstream:
# https://github.com/earendil-works/pi-coding-agent
set -euo pipefail

PI_ROOT="${PI_ROOT:-$(npm prefix -g)/lib/node_modules/@earendil-works/pi-coding-agent}"
KEYS="$PI_ROOT/node_modules/@earendil-works/pi-tui/dist/keys.js"

if [ ! -f "$KEYS" ]; then
  echo "pi-tui keys.js not found at $KEYS (PI_ROOT=$PI_ROOT)" >&2
  exit 1
fi

if grep -q "kitty-modifier-fix" "$KEYS"; then
  echo "already patched: $KEYS"
  exit 0
fi

python3 - "$KEYS" <<'PY'
import sys

path = sys.argv[1]
src = open(path).read()

old = "modifier: modValue - 1, eventType"
new = "modifier: (_kittyProtocolActive ? modValue : modValue - 1) /* kitty-modifier-fix */, eventType"

count = src.count(old)
assert count == 4, f"expected 4 kitty modifier decodings, found {count}"
src = src.replace(old, new)
open(path, "w").write(src)
print(f"patched {count} kitty modifier decodings in {path}")
PY
