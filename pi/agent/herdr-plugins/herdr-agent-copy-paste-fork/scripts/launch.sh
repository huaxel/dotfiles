#!/usr/bin/env bash
# Pane entrypoint. Reads the fork parameters that fork.sh passed via --env and
# runs the agent CLI resumed as a fresh, independent session. Herdr sets the
# pane's working directory via --cwd; HERDR_FORK_CWD is a belt-and-suspenders
# fallback.
#
# When the agent exits — including when you Ctrl-C out of it — the pane drops to
# an interactive shell instead of terminating, so Herdr does not tear down the
# tab or split.
set -euo pipefail

# Land in an interactive login shell so the pane stays alive. In a Herdr pane at
# least one of stdin/stdout is a tty; in tests/pipelines neither is, so there we
# just exit instead of blocking on an interactive read. Optional arg is the exit
# status to use.
open_shell() {
  if [ -t 0 ] || [ -t 1 ]; then
    exec "${SHELL:-/bin/bash}" -i -l
  fi
  exit "${1:-0}"
}

# Run the agent under a PTY, mirroring its output to the terminal live while also
# recording it. Full-screen (TUI) agents keep working because the child still
# sees a real terminal, sized to the actual pane and kept in sync on resize.
# Requires python3; the caller falls back to running the agent directly when it
# is missing. NOTE: only double quotes inside — the whole program is a
# single-quoted bash string.
CAPTURE_PY='
import os, sys, pty, tty, termios, fcntl, signal, select, errno, struct

logpath, argv = sys.argv[1], sys.argv[2:]

# Pick a real terminal fd to copy the window size from.
ttyfd = None
for f in (0, 1, 2):
    if os.isatty(f):
        ttyfd = f
        break
if ttyfd is None:
    try:
        ttyfd = os.open("/dev/tty", os.O_RDWR)
    except Exception:
        ttyfd = None

pid, master = pty.fork()
if pid == 0:
    try:
        os.execvp(argv[0], argv)
    except Exception:
        os._exit(127)

def sync_size(signum=None, frame=None):
    if ttyfd is None:
        return
    try:
        ws = fcntl.ioctl(ttyfd, termios.TIOCGWINSZ, b"\0" * 8)
        fcntl.ioctl(master, termios.TIOCSWINSZ, ws)
    except Exception:
        pass

sync_size()
try:
    signal.signal(signal.SIGWINCH, sync_size)
except Exception:
    pass

old = None
if ttyfd is not None and os.isatty(0):
    try:
        old = termios.tcgetattr(0)
        tty.setraw(0)
    except Exception:
        old = None

log = open(logpath, "wb")
fds = [master, 0]
try:
    while fds:
        try:
            rfds, _, _ = select.select(fds, [], [])
        except (OSError, select.error) as e:
            if getattr(e, "errno", None) == errno.EINTR:
                continue
            break
        if master in rfds:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b""
            if not data:
                break
            os.write(1, data)
            try:
                log.write(data); log.flush()
            except Exception:
                pass
        if 0 in rfds:
            try:
                data = os.read(0, 65536)
            except OSError:
                data = b""
            if not data:
                fds.remove(0)
            else:
                try:
                    os.write(master, data)
                except OSError:
                    pass
finally:
    if old is not None:
        try:
            termios.tcsetattr(0, termios.TCSAFLUSH, old)
        except Exception:
            pass
    log.close()

_, status = os.waitpid(pid, 0)
if hasattr(os, "waitstatus_to_exitcode"):
    sys.exit(os.waitstatus_to_exitcode(status))
sys.exit(status >> 8 if status > 255 else status)
'

# Print a readable tail of the recorded session. TUI agents restore the primary
# screen on exit, so everything after the last alternate-screen-exit sequence is
# exactly what they left on screen (usually a resume hint). Fall back to the
# whole capture when no alternate screen was used. Needs perl for the cleanup.
replay_tail() {
  local log="$1"
  [ -s "$log" ] || return 0
  command -v perl >/dev/null 2>&1 || return 0

  local text
  text="$(
    perl -0777 -pe '
      s/.*\x1b\[\?(?:1049|1047|47)l//s;              # keep only after last alt-screen exit
      s/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)//g;         # OSC sequences (titles, etc.)
      s/\x1b\[[0-9;?]*[ -\/]*[@-~]//g;                # CSI sequences (colors, cursor)
      s/\x1b[()][A-Za-z0-9]//g; s/\x1b[=>78]//g;      # charset / misc escapes
      s/\r//g;                                        # carriage returns
      s/[\x00-\x08\x0b\x0c\x0e-\x1f]//g;              # remaining control chars (keep \t \n)
      s/[ \t]+\n/\n/g; s/\n{3,}/\n\n/g;               # trim trailing ws, squeeze blanks
      s/\A\s+//; s/\s+\z//;                           # trim leading/trailing whitespace
    ' "$log" | tail -n 40
  )"

  [ -n "$text" ] || return 0
  printf -- '--- last output from %s ---\n' "${HERDR_FORK_AGENT:-agent}"
  printf '%s\n' "$text"
  printf -- '---------------------------------\n'
}

# Run the agent, then hold the pane open. Ctrl-C still reaches the agent: the
# terminal delivers SIGINT to the foreground process, while this launcher merely
# ignores it for its own process so it survives to open the shell. The trap is a
# handler (not "ignore"), so it is reset to default in the agent child.
hold_open() {
  local status=0 log=""
  trap ':' INT
  if [ -t 1 ] && command -v python3 >/dev/null 2>&1; then
    log="$(mktemp "${TMPDIR:-/tmp}/herdr-fork.XXXXXX")" || log=""
  fi
  if [ -n "$log" ]; then
    python3 -c "$CAPTURE_PY" "$log" "$@" || status=$?
  else
    "$@" || status=$?
  fi
  trap - INT
  printf '\nherdr-fork: %s exited (status %s). Pane held open -- Ctrl-D to close.\n' \
    "${HERDR_FORK_AGENT:-agent}" "$status" >&2
  if [ -n "$log" ]; then
    replay_tail "$log" >&2
    rm -f "$log"
  fi
  open_shell "$status"
}

# Test hook: `launch.sh --self-test-replay <capture-file>` prints the cleaned
# tail and exits, so replay_tail can be exercised without a live agent.
if [ "${1:-}" = "--self-test-replay" ]; then
  replay_tail "${2:-}"
  exit 0
fi

agent="${HERDR_FORK_AGENT:-}"
value="${HERDR_FORK_VALUE:-}"
cwd="${HERDR_FORK_CWD:-}"

# Opt-in diagnostics: set HERDR_FORK_DEBUG=1 to trace pane startup to a file.
if [ -n "${HERDR_FORK_DEBUG:-}" ]; then
  {
    printf 'launch pid=%s pwd=%s script=%s stdin_tty=%s stdout_tty=%s agent=%q value=%q cwd=%q\n' \
      "$$" "$PWD" "${BASH_SOURCE[0]}" \
      "$([ -t 0 ] && echo y || echo n)" "$([ -t 1 ] && echo y || echo n)" \
      "$agent" "$value" "$cwd"
  } >>"${TMPDIR:-/tmp}/herdr-fork-debug.log" 2>&1
fi

if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  cd "$cwd" || true
fi

if [ -z "$value" ]; then
  echo "herdr-fork: no fork request in this pane's environment." >&2
  open_shell
fi

case "$agent" in
  claude | claude-code | claudecode)
    if command -v claude >/dev/null 2>&1; then
      hold_open claude --resume "$value" --fork-session
    fi
    echo "herdr-fork: 'claude' CLI not found on PATH." >&2
    open_shell
    ;;
  codex)
    # `codex fork` wants a session UUID. If Herdr handed us a rollout path,
    # recover the UUID from it; otherwise pass the value through unchanged.
    uuid="$(printf '%s' "$value" \
      | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
      | head -1 || true)"
    if command -v codex >/dev/null 2>&1; then
      hold_open codex fork "${uuid:-$value}"
    fi
    echo "herdr-fork: 'codex' CLI not found on PATH." >&2
    open_shell
    ;;
  pi | pi-coding-agent)
    if command -v pi >/dev/null 2>&1; then
      hold_open pi --fork "$value"
    fi
    echo "herdr-fork: 'pi' CLI not found on PATH." >&2
    open_shell
    ;;
  *)
    echo "herdr-fork: unknown agent '${agent:-<none>}'; opening a plain shell." >&2
    open_shell
    ;;
esac
