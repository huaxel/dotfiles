#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HOOK="$ROOT/scripts/home-server-deploy/post-receive"
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
export HOME="$TMP/home"
export TMPDIR="$TMP/checkouts"
mkdir -p "$HOME/bin" "$HOME/apps" "$HOME/repos" "$TMPDIR"
export PATH="$HOME/bin:$PATH"

cat > "$HOME/bin/tailscale" <<'MOCK'
#!/usr/bin/env bash
[ "${1:-}" = ip ] && { echo 100.64.0.10; exit 0; }
exit 1
MOCK
cat > "$HOME/bin/caddy" <<'MOCK'
#!/usr/bin/env bash
if [ "${1:-}" = validate ] && [ "${MOCK_FAIL_CADDY:-0}" = 1 ]; then exit 42; fi
if [ "${1:-}" = validate ] && [ "${MOCK_SIGNAL_HOOK:-0}" = 1 ] && [ ! -e "$HOME/signal-sent" ]; then
  touch "$HOME/signal-sent"
  kill -TERM "$MOCK_HOOK_PID"
fi
exit 0
MOCK
cat > "$HOME/bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
# The fixture models an active user Caddy service.
case "$*" in
  *"--user is-active --quiet caddy"*|*"--user reload caddy"*) exit 0 ;;
  *) exit 0 ;;
esac
MOCK
cat > "$HOME/bin/flock" <<'MOCK'
#!/usr/bin/env bash
# util-linux flock is present on the Debian servers; serialization itself is
# covered statically here because macOS does not ship flock.
exit 0
MOCK
chmod +x "$HOME/bin/"*
printf '{\n\tadmin 127.0.0.1:2019\n}\n\nimport %s/apps/*/current/Caddyfile\n' "$HOME" > "$HOME/Caddyfile"

work="$TMP/work"
repo="$HOME/repos/demo.git"
git init -q "$work"
git -C "$work" config user.email test@example.invalid
git -C "$work" config user.name Test
printf 'first\n' > "$work/index.html"
git -C "$work" add index.html
git -C "$work" commit -qm first
first=$(git -C "$work" rev-parse HEAD)
git clone -q --bare "$work" "$repo"

# A failed first deployment has nothing to restore and must leave no published
# symlink or release behind.
if (
  cd "$repo"
  printf '%040d %s refs/heads/main\n' 0 "$first" | MOCK_FAIL_CADDY=1 bash "$HOOK"
); then
  echo "failed initial Caddy validation unexpectedly reported success" >&2
  exit 1
else
  status=$?
  test "$status" -eq 42
fi
test -z "$(find "$TMPDIR" -mindepth 1 -print -quit)"
test ! -e "$HOME/apps/demo/current"
test "$(find "$HOME/apps/demo/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = 0

# A tag and main update in one push must still deploy main.
(
  cd "$repo"
  printf '%040d %s refs/tags/v1\n%040d %s refs/heads/main\n' 0 "$first" 0 "$first" | bash "$HOOK"
)
first_release=$(readlink -f "$HOME/apps/demo/current")
test -f "$first_release/index.html"
grep -qx first "$first_release/index.html"
test -z "$(find "$TMPDIR" -mindepth 1 -print -quit)"

# Force failure after symlink swap. The old release must be restored and the
# failed release removed rather than becoming current.
printf 'second\n' > "$work/index.html"
git -C "$work" add index.html
git -C "$work" commit -qm second
second=$(git -C "$work" rev-parse HEAD)
git -C "$work" push -q "$repo" main
if (
  cd "$repo"
  printf '%s %s refs/heads/main\n' "$first" "$second" | MOCK_FAIL_CADDY=1 bash "$HOOK"
); then
  echo "failed Caddy validation unexpectedly reported success" >&2
  exit 1
else
  status=$?
  test "$status" -eq 42
fi
test -z "$(find "$TMPDIR" -mindepth 1 -print -quit)"
test "$(readlink -f "$HOME/apps/demo/current")" = "$first_release"
grep -qx first "$HOME/apps/demo/current/index.html"
test "$(find "$HOME/apps/demo/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = 1

# Signal the original hook PID after the swap, not an internal worker PID.
# Cleanup must roll back the release and preserve the signal exit status.
if (
  cd "$repo"
  printf '%s %s refs/heads/main\n' "$first" "$second" |
    MOCK_SIGNAL_HOOK=1 bash -c 'export MOCK_HOOK_PID=$$; exec bash "$1"' _ "$HOOK"
); then
  echo "terminated hook unexpectedly reported success" >&2
  exit 1
else
  status=$?
  test "$status" -eq 143
fi
test -z "$(find "$TMPDIR" -mindepth 1 -print -quit)"
test "$(readlink -f "$HOME/apps/demo/current")" = "$first_release"
test "$(find "$HOME/apps/demo/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = 1

# Branch deletion is intentionally ignored.
(
  cd "$repo"
  printf '%s %040d refs/heads/main\n' "$second" 0 | bash "$HOOK"
)
test "$(readlink -f "$HOME/apps/demo/current")" = "$first_release"

echo "home-server deploy tests passed"
