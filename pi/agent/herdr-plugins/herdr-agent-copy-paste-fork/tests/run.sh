#!/usr/bin/env bash
# Host-free test. Stubs the `herdr`, `claude`, `codex`, and `pi` binaries and checks
# both halves of the plugin:
#   1. fork.sh builds the right `herdr plugin pane open` command (tab + split).
#   2. launch.sh turns the passed-in environment into the right agent argv.
# Run: bash tests/run.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$root/tests/.tmp"
rm -rf "$work"
mkdir -p "$work/bin" "$work/project"

pass=0
fail=0
check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "ok   - $label" >&2
    pass=$((pass + 1))
  else
    echo "FAIL - $label" >&2
    echo "        expected: $expected" >&2
    echo "        actual:   $actual" >&2
    fail=$((fail + 1))
  fi
}

# --- stub agent CLIs (record argv + cwd, then exit) ------------------------
for agent in claude codex pi; do
  cat >"$work/bin/$agent" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >"$work/${agent}.argv"
printf '%s\n' "\$PWD" >"$work/${agent}.pwd"
exit 0
EOF
  chmod +x "$work/bin/$agent"
done

# --- stub herdr: answers 'pane get', records 'plugin pane open' argv --------
make_herdr() {
  local agent="$1" value="$2"
  cat >"$work/bin/herdr" <<EOF
#!/usr/bin/env bash
set -euo pipefail
case "\$1 \$2" in
  "pane get")
    cat <<'JSON'
{"id":"cli:pane:get","result":{"type":"pane_info","pane":{
  "pane_id":"w1:p3","terminal_id":"t1","workspace_id":"w1","tab_id":"w1:t2",
  "agent_status":"idle","agent":"$agent","foreground_cwd":"$work/project",
  "agent_session":{"source":"detection","agent":"$agent","kind":"native","value":"$value"}}}}
JSON
    ;;
  "plugin pane")
    shift 2   # drop 'plugin pane'
    printf '%s\n' "\$*" >"$work/pane-open.argv"
    ;;
  "pane run")
    shift 2   # drop 'pane run'; \$1=pane_id, \$2=command
    printf '%s\n' "\$@" >"$work/pane-run.argv"
    ;;
  "notification show") exit 0 ;;
  *) echo "unexpected herdr call: \$*" >&2; exit 2 ;;
esac
EOF
  chmod +x "$work/bin/herdr"
}

export PATH="$work/bin:$PATH"
export HERDR_BIN_PATH="$work/bin/herdr"
export HERDR_PLUGIN_ID="herdr-plugins.fork"
export HERDR_PANE_ID="w1:p3"

# === 1. fork.sh builds the correct pane-open command =======================
make_herdr claude abc123
bash "$root/scripts/fork.sh" --placement tab
check "fork: tab pane-open argv" \
  "open --plugin herdr-plugins.fork --entrypoint session --env HERDR_FORK_AGENT=claude --env HERDR_FORK_VALUE=abc123 --env HERDR_FORK_CWD=$work/project --placement tab" \
  "$(cat "$work/pane-open.argv")"

bash "$root/scripts/fork.sh" --placement split --direction right
check "fork: split pane-open argv" \
  "open --plugin herdr-plugins.fork --entrypoint session --env HERDR_FORK_AGENT=claude --env HERDR_FORK_VALUE=abc123 --env HERDR_FORK_CWD=$work/project --placement split --direction right" \
  "$(cat "$work/pane-open.argv")"

# === 2. launch.sh resolves the environment into the right agent argv ========
# Runs launch.sh (no tty -> agent runs directly, no capture) and leaves the
# recorded argv/pwd in files for the parent scope to assert. Keep assertions out
# of command substitution so their pass/fail counters aggregate.
launch_case() {
  local agent="$1" value="$2"
  rm -f "$work/${agent}.argv" "$work/${agent}.pwd"
  env HERDR_FORK_AGENT="$agent" HERDR_FORK_VALUE="$value" HERDR_FORK_CWD="$work/project" \
    bash "$root/scripts/launch.sh"
}

launch_case claude abc123
check "claude: launched in project cwd" "$work/project" "$(cat "$work/claude.pwd")"
check "claude: fork argv" "--resume abc123 --fork-session" "$(cat "$work/claude.argv")"

uuid="11111111-2222-3333-4444-555555555555"
launch_case codex "$uuid"
check "codex: launched in project cwd" "$work/project" "$(cat "$work/codex.pwd")"
check "codex: fork argv (uuid)" "fork $uuid" "$(cat "$work/codex.argv")"

launch_case codex "/home/u/.codex/sessions/rollout-$uuid.jsonl"
check "codex: fork argv (uuid from path)" "fork $uuid" "$(cat "$work/codex.argv")"

launch_case pi abc123
check "pi: launched in project cwd" "$work/project" "$(cat "$work/pi.pwd")"
check "pi: fork argv" "--fork abc123" "$(cat "$work/pi.argv")"

# === 3. replay_tail cleans a captured TUI session to its final output =======
if command -v perl >/dev/null 2>&1; then
  cap="$work/capture.raw"
  # Alt-screen churn, then the primary-buffer resume hint after the exit seq.
  printf 'boot\x1b[?1049hALT \x1b[31mcolored\x1b[0m redraw junk\x1b[?1049lResume this branch with:\r\n  claude --resume abc-123\n' >"$cap"
  replayed="$(HERDR_FORK_AGENT=claude bash "$root/scripts/launch.sh" --self-test-replay "$cap")"
  check "replay: shows only post-alt-screen tail" \
    "--- last output from claude ---
Resume this branch with:
  claude --resume abc-123
---------------------------------" \
    "$replayed"

  : >"$work/empty.raw"
  check "replay: empty capture yields nothing" "" \
    "$(HERDR_FORK_AGENT=claude bash "$root/scripts/launch.sh" --self-test-replay "$work/empty.raw")"
else
  echo "skip - replay tests (perl not installed)" >&2
fi

# === 4. copy.sh captures the session; paste.sh types it into the focused pane =
export HERDR_PLUGIN_STATE_DIR="$work/state"

copy_paste_case() {
  local agent="$1" value="$2" expect_cmd="$3"
  rm -rf "$work/state" "$work/pane-run.argv"
  make_herdr "$agent" "$value"
  bash "$root/scripts/copy.sh"
  check "$agent: clipboard captured value" "$value" \
    "$(jq -r '.value' "$work/state/clipboard.json")"
  bash "$root/scripts/paste.sh"
  # pane-run.argv is [pane_id, command]; the command is the second line.
  check "$agent: paste runs fork command" "$expect_cmd" \
    "$(sed -n 2p "$work/pane-run.argv")"
}

copy_paste_case claude abc123 \
  "cd $work/project && claude --resume abc123 --fork-session"
copy_paste_case codex "$uuid" \
  "cd $work/project && codex fork $uuid"
copy_paste_case pi abc123 \
  "cd $work/project && pi --fork abc123"

# A codex clipboard holding a rollout path recovers the UUID on paste.
rm -rf "$work/state" "$work/pane-run.argv"
make_herdr codex "/home/u/.codex/sessions/rollout-$uuid.jsonl"
bash "$root/scripts/copy.sh"
bash "$root/scripts/paste.sh"
check "codex: paste recovers uuid from path" \
  "cd $work/project && codex fork $uuid" \
  "$(sed -n 2p "$work/pane-run.argv")"

# Paste with nothing copied must not run anything.
rm -rf "$work/state" "$work/pane-run.argv"
bash "$root/scripts/paste.sh" 2>/dev/null || true
check "paste: no-op when clipboard empty" "0" \
  "$([ -f "$work/pane-run.argv" ] && echo 1 || echo 0)"

echo >&2
echo "passed: $pass  failed: $fail" >&2
[ "$fail" -eq 0 ]
