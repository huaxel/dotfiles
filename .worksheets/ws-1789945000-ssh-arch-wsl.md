# Diagnose SSH to arch-wsl — 2026-09-20

## Task
Determine why `ssh arch-wsl` cannot connect.

## Human notes

## Todos
- [x] Capture the exact SSH failure and local resolution state
- [x] Identify whether the issue is stale address, Tailscale reachability, or SSH service/authentication
- [x] Verify the proposed TTY workaround against noninteractive commands and file transfer

## Progress
- Inspected repository SSH configuration.
- Initially changed `arch-wsl` from `RequestTTY auto` to `RequestTTY force` and activated it; later adversarial testing found that this breaks rsync transport, so the source change was reverted to `auto`.
- `scp arch-wsl:/etc/hostname` succeeds, but `rsync arch-wsl:/etc/hostname ...` hangs under forced TTY allocation; the leaked test SSH process was identified and terminated.
- Reactivated `juan@macbook` after reverting the source. Live `ssh -G arch-wsl` now reports `requesttty auto`.
- Verified standard `rsync -a arch-wsl:/etc/hostname ...` completes successfully again.
- `arch-wsl` currently maps to hard-coded `100.81.226.52`, user `juan`, with no explicit port or key.
- Verbose SSH output confirms TCP connection, OpenSSH negotiation, public-key authentication, and accepted interactive shell.

## Findings
- `ssh_config` defines `Host arch-wsl` with `HostName 100.81.226.52`.
- The supplied log ends with `Authenticated to 100.81.226.52`, `shell request accepted`, so the SSH connection itself is working.
- `ssh -tt arch-wsl` opens a working interactive Bash prompt and exits cleanly.
- The apparent `--norc` error was caused by entering the command across a real newline: Bash ran `bash --noprofile`, then tried to execute `--norc` as a separate command.
- There is currently no confirmed SSH or remote shell startup failure.
- `RequestTTY force` is not a safe host-wide fix: noninteractive `ssh arch-wsl 'printf connected'` adds a connection-close diagnostic, and rsync hangs because its protocol is carried over a PTY. Keep `RequestTTY auto`; use `ssh -tt arch-wsl` only when an explicit forced interactive PTY is needed.
- Other machines use stable `*.bonobo-fort.ts.net` Tailscale names; `arch-wsl` is the outlier using a raw Tailscale IP.
- The repository documents Arch WSL as a WSL2 host, so the target must be running and its SSH daemon must be listening.

## Decisions

- Keep `RequestTTY auto`; the temporary `force` workaround was rejected after regression testing.
- Treat the original report as resolved diagnostics, not an SSH connectivity failure. Authentication, command execution, and SCP all work.

## Questions / Next steps

- No SSH change remains to commit. If plain interactive SSH ever lacks a prompt, use `ssh -tt arch-wsl` for that invocation and capture the remote shell startup trace before changing host-wide TTY policy.
