#!/usr/bin/env bash
# Install tracked system config files (the etc/ tree) into /, with sudo.
#
# dotter only manages user-owned files under $HOME; root-owned files in /etc
# live here instead. Every file under etc/ mirrors its real path: e.g.
# etc/conf.d/llama.cpp -> /etc/conf.d/llama.cpp.
#
# Idempotent: only touches files whose content differs, and only restarts a
# service when its config actually changed. Safe to re-run any time.
set -euo pipefail

ETC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
changed=()

while IFS= read -r -d '' src; do
  rel="${src#"$ETC_DIR"/}"
  dest="/etc/$rel"
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    continue
  fi
  echo "→ installing /etc/$rel"
  sudo install -D -m 644 -o root -g root "$src" "$dest"
  changed+=("$rel")
done < <(find "$ETC_DIR" -type f ! -name '*.sh' -print0)

if [ ${#changed[@]} -eq 0 ]; then
  echo "✅ system config already up to date"
  exit 0
fi

# Reload systemd if any unit/drop-in changed.
if printf '%s\n' "${changed[@]}" | grep -q '^systemd/'; then
  echo "↻ systemctl daemon-reload (unit/drop-in changed)"
  sudo systemctl daemon-reload || true
fi

# Restart affected services.
if printf '%s\n' "${changed[@]}" | grep -qE '^(conf.d/llama.cpp|systemd/system/llama.cpp)'; then
  echo "↻ restarting llama.cpp.service (config changed)"
  sudo systemctl restart llama.cpp.service || true
fi

echo "✅ installed: ${changed[*]}"
