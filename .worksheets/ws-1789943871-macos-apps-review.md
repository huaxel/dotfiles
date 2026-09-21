# macOS applications and defaults review

## Task
Audit macOS bootstrap applications, Brew ownership, defaults, shell startup, Home Manager boundaries, launch agents, security, and recovery.

## Human notes

## Todos
- [x] Inventory macOS bootstrap, packages, defaults, and application configuration
- [x] Inspect live package/default/security drift
- [x] Identify and prioritize actionable issues
- [x] Implement safe high-value fixes and verification
- [x] Record host-only or policy decisions that remain

## Progress
- Started from a clean, synchronized main branch.
- Removed the duplicate failing Homebrew Tailscale daemon while preserving the healthy Tailscale app and verified its tailnet connection.
- Stopped idle PHP-FPM and empty Transmission daemon launch agents; removed the stale failing Homebrew Atuin agent.
- Restored the system default download-quarantine behavior on the live account.
- Reconciled recently installed applications/tools into the Brewfile and removed redundant Homebrew copies owned by mise or Home Manager. This removed roughly 2.5 GiB, chiefly an unused LLVM dependency of Homebrew Rust.
- Removed 57 broken external-app configuration symlinks (legacy Devin skills, CUA driver, and missing Copilot IntelliJ targets); runtime Chrome singleton links were preserved.
- Added `check-macos` regressions and included them in `just ci`.
- Updated App Store provisioning for `mas` 7, which removed the old `account` command; missing apps are now attempted individually with actionable failure output.
- Final `just ci-strict` passes, including the native `juan@macbook` Home Manager build.

## Findings
- **Resolved — download security was weakened.** `macos/defaults.sh` explicitly disabled LaunchServices quarantine. It now removes the legacy override and lets macOS use its secure default. Gatekeeper, SIP, FileVault, immediate screen locking, and automatic update scheduling are enabled.
- **Resolved — Brew service directives created unintended daemons.** Tailscale formula and app were installed together; the formula daemon could not run without root and failed continuously. PHP-FPM listened on loopback despite no clients, and an empty Transmission daemon listened on all interfaces on ports 51413 and 9091. The Brewfile no longer auto-starts these services; live agents were stopped and removed.
- **Resolved — package ownership and manifest drift.** Newer apps (ChatGPT, Copilot CLI, IPTVnator, LocalSend, macFUSE/SSHFS, Sysdata, VS Code) and requested CLI tools are now reproducible. Homebrew copies of Go, Rust, Python 3.12, Node 22, Ruby, and ShellCheck were redundant with mise/Home Manager and were removed. `brew bundle check` passes.
- **Resolved — cleanup execution was fragile.** `macos/cleanup.sh` used `eval`, ignored failures globally, accepted arbitrary mode values, mislabeled normal runs as aggressive, and could overwrite same-named recordings. It now executes argument arrays directly, validates flags, fails on errors, uses modern `launchctl bootout`, and moves recordings without clobbering.
- **Resolved — fresh bootstrap mixed App Store installs into the initial Brew phase.** It now filters `mas` entries until sign-in is checked and treats Homebrew package failure as an incomplete deployment rather than eventual success.
- **Healthy — shell and configuration ownership.** Nushell is the login shell, both native and XDG config paths point to the current Home Manager generation, and the Nushell health suite passes.
- **Healthy — managed App Store apps.** Amphetamine, Connective Plugin, and Flow are installed.
- **Unresolved — no automatic backup destination.** Time Machine has no configured destination; `just backup-preflight` now reaches the mounted SSD but correctly refuses it because the volume is unencrypted. The backup/restore drill remains prepared but unexecuted.
- **SSD inventory recorded.** KingstonPhotos contains the primary `Photos Library.photoslibrary` (638 GB), `Internal System Library Backup 2026-08-26.photoslibrary` (105 GB), `Internal Photos Recovery.photoslibrary` (78 GB), and `Photos-Reconciliation-Candidates` (21 GB; ~11,987 JPG/JPEG/XMP/media files). These are not safe deletion candidates without reviewing the Photos/reconciliation state.
- **Resolved — three Office app seals were invalid.** Excel, OneNote, and PowerPoint contained modified proofing-tool binaries. A signed Microsoft Office 16.113.1 package reinstall replaced all Office bundles; strict `codesign` verification and macOS execution assessment now pass for Excel, OneNote, PowerPoint, Word, and Outlook.
- The application firewall remains disabled by the user's earlier explicit decision; this audit does not reverse that policy.

## Decisions
- Use the signed macOS Tailscale app as the sole Tailscale owner; do not install or run the Homebrew formula daemon alongside it.
- Installing a CLI formula must not imply running its background service. PHP and Transmission remain available on demand.
- mise owns Go/Rust/Python and non-bootstrap Node versions; Home Manager owns ShellCheck. Homebrew retains `node` because Brew packages and post-bootstrap npm extras require it.
- Installed-on-request applications added since the original July Brewfile are treated as intentional desired state; stale Dotter and duplicate package copies are not.

## Questions / Next steps
- [x] Repair and verify the invalid Microsoft Office app signatures with the signed 16.113.1 installer.
- [ ] Configure a Time Machine destination or complete the prepared encrypted removable-media backup and restore drill.
- [x] Run the strict project gate. Independent agent review was unavailable because no reviewer agent is configured and both available model quota groups were exhausted; a final local diff review found and fixed `mas` 7 incompatibility.
