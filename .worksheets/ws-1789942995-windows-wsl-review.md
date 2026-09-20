# Windows and WSL setup review — 2026-09-21 00:23

## Task
Audit the Windows and WSL dotfiles setup for correctness, security, portability, maintainability, and recovery readiness.

## Human notes

## Todos
- [x] Inventory Windows bootstrap, deployment, secrets, applications, and WSL boundaries
- [x] Run available static and repository validation
- [x] Identify and prioritize actionable issues
- [x] Implement safe high-value fixes and verify them
- [x] Record Windows-host-only checks that remain

## Progress
- Started audit from a clean, synchronized `main`.
- Reviewed Windows bootstrap/deployment, PowerShell profiles, SOPS materialization, Pi state synchronization, Windows Terminal, GlazeWM, Zebar, AutoHotkey, llama.cpp startup, WSL VPN/mount management, and both WSL compaction entry points.
- Parsed all maintained PowerShell sources with PowerShell 7.6.6's native AST parser from a disposable Nix shell.
- Validated Windows Terminal/Zebar JSON and GlazeWM YAML; ShellCheck and Bash syntax checks pass for changed WSL scripts.
- Added cross-platform `just check-windows` regression coverage and included it in `just ci`.
- Executed PowerShell behavior tests proving malformed auth files remain byte-for-byte intact and valid multi-provider auth files retain existing OAuth data while adding Openference atomically without a UTF-8 BOM.
- Final `just ci-strict` passes completely. The gate reports the expected local `pwsh` skip, while the separate disposable-Nix PowerShell AST parse passed.
- Independent delegated review is unavailable because both model quota groups remain exhausted; performed a manual adversarial diff review instead.

## Findings

### High priority — resolved

1. **WSL compaction could unregister a distro automatically.** `compact-wsl.ps1` fell back from failed sparse mode to export → unregister → import without explicit destructive confirmation or robust native exit checks. It now never auto-falls back, requires `-ExportFallback -ConfirmDestructive`, verifies a non-empty export before unregistering, checks every destructive native step, and retains the archive if import fails.

2. **Secret deployment could falsely succeed.** Missing SOPS/age, a missing age key, absent encrypted inputs, and failed decryptions previously returned or printed warnings while bootstrap still declared success. These conditions now throw and stop deployment.

3. **PowerShell profile startup could destroy OAuth state.** `Load-Secrets.ps1` replaced malformed `auth.json` with a new Openference-only object. It now warns and preserves malformed files, while valid files are merged via atomic UTF-8-without-BOM replacement. Both malformed-file preservation and valid multi-provider merge were executed under PowerShell.

4. **Zebar was incomplete on a fresh machine.** Settings referenced pack `bar`, but `zebar/bar/` was never deployed. The pack directory is now linked into `~/.glzr/zebar/bar`.

5. **Windows deployment link removal used `-Recurse`.** Removing a directory symlink/junction recursively risks traversing its target on older PowerShell behavior. Link removal now removes only the link; real paths continue to be moved to unique timestamp/PID backups.

### Medium priority — resolved

6. **Windows Terminal was tied to one username.** The pwsh command used `C:\\Users\\jbenjumeamoreno`; it now uses `%USERPROFILE%`.

7. **Configured terminal fonts were not installed.** Bootstrap now adds the Scoop `nerd-fonts` bucket and installs `JetBrainsMono-NF` and `FiraCode-NF`.

8. **Native Scoop/Git failures were not terminating.** PowerShell's `ErrorActionPreference` does not cover native exit codes. Bootstrap now checks bucket, package, and Git operations before continuing. The custom bucket also uses its portable bucket name rather than an owner/name alias.

9. **Windows PowerShell 5.1 profile assumed modern PSReadLine.** Interactive setup is now guarded, and unsupported prediction configuration no longer breaks shell startup.

10. **WSL-side compaction had correctness/safety bugs.** Optional variables caused `set -u` crashes when `~/atom-data` existed; orphan package names were passed as one argument while success was still claimed; and `--allow-unsafe` ran automatically. Defaults, array-safe package removal, truthful reporting, and explicit `ALLOW_UNSAFE_SPARSE=true` gating are now in place.

11. **`wsl-vpn-setup.sh status` mutated state.** It mounted `/mnt/atomsrc`; status is now read-only and reports VPN/mount exit status independently.

### Remaining observations

- Scoop's official installer remains a network-delivered `Invoke-RestMethod | Invoke-Expression` bootstrap. This is standard Scoop installation behavior but is still a supply-chain trust decision.
- Windows and WSL package inputs remain floating rather than lockfile-pinned. This favors easy personal-machine updates over bit-for-bit reconstruction.
- Flow Launcher has documentation but no exported settings payload yet; its application settings remain manual state.
- AutoHotkey, GlazeWM, and Zebar configuration is deployed, but startup registration and real keybinding/monitor behavior require a Windows session to validate.
- Native Windows backup/restore automation is still thinner than macOS recovery. The irreplaceable age/SSH/GPG keys and WSL distro should be covered by the user's chosen Windows backup system.

## Decisions

- Never unregister/re-import a WSL distro as an automatic fallback.
- Treat secret materialization as a required bootstrap stage, not an optional warning.
- Preserve malformed credential stores for manual recovery rather than resetting them.
- Keep `status` commands read-only and gate unsafe/destructive modes behind explicit opt-ins.

## Questions / Next steps

- [ ] On Windows, run `bootstrap.ps1` in a disposable/test user and confirm Scoop package names, Developer Mode symlinks, fonts, Zebar pack discovery, and both PowerShell profiles.
- [ ] Run `just check-windows` (or the equivalent script) on Windows with `pwsh` available.
- [ ] Test `wsl-vpn-setup.sh status|reconnect|mount` against the work VPN and CIFS share.
- [ ] Before any real export/re-import compaction, create and verify an independent WSL backup.
- [ ] Decide whether to export/version Flow Launcher settings and register AutoHotkey/GlazeWM/Zebar startup automatically.
