# Dotfiles and overall setup review — 2026-09-20 23:43

## Task
Review the dotfiles repository and the overall development/agent setup.

## Human notes
<!-- goals, constraints, feedback, or a requested action -->

## Todos
- [x] Inventory architecture, tooling, and repository health
- [x] Run the documented quality gate
- [x] Identify correctness, security, portability, and maintainability risks
- [x] Attempt independent cross-review (blocked: no configured reviewer; Claude/GPT quota exhausted and Gemini five-hour quota exhausted)
- [x] Prioritize actionable recommendations

## Progress
- Inventoried Nix/Home Manager, bootstrap/deployment, macOS package state, secrets, backups, Pi/agent tooling, CI, repository hygiene, and live machine health.
- Reused and validated the completed Pi, Nix, and branch-review worksheets rather than repeating those audits.
- `just ci` passes: 71 shell scripts, 74 TypeScript files, 30 package tests, three encrypted secrets, Nushell, templates, and the native macOS Home Manager build.
- `npm audit --omit=dev` reports zero vulnerabilities. `just nu-health` passes. FileVault, SIP, and Gatekeeper are enabled.
- Review phase initially changed only this worksheet.
- Implemented the accepted recovery/bootstrap hardening: portable and failure-aware backup/restore, completion markers, canonical Pi session preservation without overwriting tracked Pi source, credential exclusions, isolated regression tests, non-destructive skills migration, and truthful bootstrap failure status.
- Retired stale tracked Dotter caches and the dangling machine-specific skill link; localized `pi/agent/trust.json` while preserving the current working copy.
- Added a tracked npm workspace lock, all-package tests/typecheck, recovery tests, lock synchronization checks, and `just ci-strict`.
- Enabled Git fetch/transfer object verification and corrected script executable modes.
- Repaired live safe drift with `mise reshim` and `brew unlink ruby`; Brew bundle is now satisfied and mise reports no problems (two advisory warnings remain).
- Final `just ci-strict` passes completely after review fixes.
- Concurrent `ssh_config` and Herdr-managed integration changes from the separate SSH worksheet were preserved and excluded from this task's attribution.
- Added `just backup-preflight` and `just backup-workstation`; macOS now verifies destination encryption before copying private keys and refuses unencrypted media unless explicitly overridden for one run.
- Extended adversarial recovery coverage for paths containing spaces, forged completion markers missing the Age key, unencrypted destinations, backup copy failures, and restore copy failures. New backup directories/metadata use a private umask.
- Confirmed the real preflight fails safely because `/Volumes/KingstonPhotos` is not mounted. A later `just backup-preflight` repeats the same safe failure; no physical backup was attempted.
- Confirmed `tmutil destinationinfo` reports no Time Machine destination and `tmutil latestbackup` cannot mount one. `diskutil list` shows no KingstonPhotos or other external physical disk attached; the blocker is physical media, not an unlock/mount failure. Workstation disaster recovery remains the only uncompleted manual setup item.
- Clarified `README.md` with explicit volume-unlock/mount checks, the intentional preflight failure behavior, and the required post-backup restore drill.
- Explained the application-firewall rationale (reduce unsolicited inbound access on untrusted networks); the user explicitly declined enabling it, so the firewall remains unchanged.

## Findings

### Executive assessment

The setup is unusually capable and substantially better structured than a typical personal dotfiles repository: Home Manager is the Unix authority, SOPS/age secret handling is thoughtful, host boundaries are documented, the Nix profiles evaluate and the native profile builds, CI is broad, and the recent Pi/Nix safety work is sound. The main weakness is not configuration quality; it is **disaster recovery and bootstrap truthfulness**. The repository can report success while omitting or failing important state.

### P0 — Fix backup/restore before relying on it

1. **The macOS restore script is broken for its current timestamped backup format.** `scripts/restore-from-kingston.sh:21` uses GNU `find -printf`; macOS BSD `find` rejects it (`find: -printf: unknown primary or operator`). With `set -euo pipefail`, restore exits before selecting a backup. Use portable shell glob/stat selection or explicitly depend on `gfind`.

2. **The backup script can claim complete after failed copies.** `scripts/backup-to-kingston.sh:20-34` converts every copy failure into a warning and then returns true; lines 36 onward ultimately print “Backup complete.” It also treats rsync 23/24 as unconditional success. Track failures, distinguish expected volatile-cache errors, write a completion manifest, and return non-zero unless all critical items (age, SSH, GPG, projects) were verified.

3. **The backup misses the canonical Pi state.** It backs up only `~/.pi/agent` (`scripts/backup-to-kingston.sh:74`), while configured sessions live in `~/dotfiles/pi/agent/sessions`; Pi health reports 587 MB there, including 35 orphan sessions/57 MB. This conflicts with the explicit decision to preserve sessions. Back up both trees or derive the active paths from configuration. Avoid copying auth tokens unless the destination is encrypted and that is deliberate.

4. **No active automatic Mac backup was detected.** `tmutil destinationinfo` reports no destinations, and `tmutil latestbackup` cannot mount a destination. KingstonPhotos was not mounted during review. FileVault protects the live disk but not against loss. Configure Time Machine or another automated, versioned, encrypted backup, then perform a test restore. The home-server backup is better engineered but does not protect this workstation.

### P1 — Make bootstrap safe and honest

5. **Bootstrap deletes pre-existing user skills without a backup.** `bootstrap.sh:108-112` runs `rm -rf ~/.agents/skills` whenever it is a real directory. Move it to a timestamped backup or merge after confirmation; a bootstrap should not silently destroy user-created skills.

6. **Bootstrap reports success after critical failures.** Nix installation, age-key absence, Home Manager activation, Brew bundle failures, and several install steps are downgraded to warnings (`bootstrap.sh:235-300`), but lines 392-395 always print “Dotfiles deployed successfully” and exit successfully. Keep optional apps best-effort, but accumulate critical failures and return non-zero with “partial deployment.”

7. **Fresh clones silently skip CLI extras.** `scripts/install-cli-extras.sh` is tracked as mode `100644`, while `bootstrap.sh:375` only runs it when executable. Either commit mode `100755` or call it explicitly with Bash. The same mode issue affects the two home-server backup scripts if they are copied and invoked directly by cron.

### P1 — Remove stale/broken repository state

8. **`skills/cua-driver` is a tracked absolute symlink to `/Users/juanbenjumea/.cua-driver/skills/cua-driver` and is currently dangling.** It will also be broken on Linux/Windows and on a fresh Mac. Vendor it, install it during bootstrap, or remove the tracked link.

9. **Tracked Dotter cache is stale and conflicts with the declared Home Manager ownership model.** `.dotter/cache.toml` embeds `/home/juan`; cached `gitconfig`, `starship.toml`, and `llama-models.ini` all differ from canonical files. The repository map says Home Manager is sole Unix owner. Retire `.dotter/` or regenerate/document it as an intentional Windows/legacy path; do not track generated caches.

10. **Tracked `pi/agent/trust.json` is machine/runtime state.** Live health reports 25 path drifts, mostly stale Linux and `/tmp` worktrees. This matches the earlier Pi review. Ignore/localize trust decisions rather than syncing them as portable policy.

### P2 — Improve reproducibility and live health

11. **Node workspace installs are intentionally non-reproducible.** Root `package-lock.json` is ignored, while the root workspace resolves local Pi packages. `npm audit` is clean today, but a fresh `npm install` can select different transitive versions. Commit one workspace lockfile, or explicitly accept floating installs and make CI test the resolved graph. `npm outdated` currently shows Pi core 0.85.1 → 0.86.1 and small type-package drift; no urgent security update was found.

12. **The green CI gate is environment-dependent.** ShellCheck, Deno, SOPS, Nushell, and Nix checks exit successfully when tools are absent; TypeScript lint warnings are non-blocking. This machine has the tools, so today’s pass is meaningful, but a fresh/CI host can produce a misleading green result. Add a strict CI mode that fails on missing required tools and on package type/lint failures; keep the forgiving mode for bootstrap.

13. **Git object verification is explicitly disabled** in `home/common.nix:97-101`. Unless this works around a measured failure, enable `fetch.fsckObjects` and `transfer.fsckObjects` for stronger repository integrity.

14. **Live macOS drift is small but real.** `brew bundle check --verbose` only wants formula `ruby` unlinked. `mise doctor` reports missing shims, mise paths not first, and one available mise update. Nushell itself is healthy. Fix with a deliberate `mise reshim`/PATH ordering change and decide whether Homebrew Ruby should remain unlinked.

15. **macOS application firewall is disabled.** FileVault, SIP, and Gatekeeper are enabled. Enabling the firewall is a sensible baseline for a laptop, especially with many developer services installed; verify required inbound tools afterward.

16. **Local state is manageable but concentrated.** Disk has ~395 GiB free. The largest avoidable consumers are `~/.config/web-search-cdp-profile-chrome` (4.2 GiB), `~/.cache/codex-runtimes` (1.6 GiB), repository-local Pi state (~1.5 GiB total directory), and root `node_modules` (574 MiB). Do not auto-delete sessions; add visibility/retention controls for disposable browser and runtime caches.

### Lower-priority consistency notes

- Homebrew and Nix package ownership is mostly clean: only `age`, `git`, and `sops` overlap, appropriately as bootstrap prerequisites.
- The Brewfile comment says it was regenerated from current state, but it is now desired-state plus a minor unlink mismatch; update the wording to prevent accidental `brew bundle dump --force` from reintroducing everything installed.
- Three current review worksheets are untracked while older worksheets are tracked. Decide whether worksheets are durable project records or local runtime state and enforce one policy.
- Existing upstream-only Nix deprecation warnings (`stdenv.is*`) remain; repository code does not contain the deprecated calls.

### Strengths worth preserving

- Clear Nix/Home Manager host split, pinned flake lock, native profile build, and recent NixOS service sandbox/firewall assertions.
- SOPS/age encryption with mode `0600`, local npm credentials, no credential-like tracked assignments found, and zero npm audit findings.
- Broad local gate and healthy Nushell integration.
- Good operational documentation and explicit safety/autonomy boundaries for coding agents.
- At review start, `main` was synchronized with `origin/main` and the Git object database was small and healthy; the current worktree now contains the implementation plus concurrent SSH/Herdr work.

## Decisions

- Treat disaster recovery as the next improvement area; avoid adding more package managers, agent extensions, or abstractions until backup and bootstrap behavior is trustworthy.
- Preserve Pi sessions as requested; storage findings are informational, not authorization to prune.
- Prefer one authority per concern: Home Manager for Unix config, Brew only for macOS/bootstrap-specific software, mise for language runtimes, and machine-local storage for trust/runtime state.
- Timestamped recovery sets without `.backup-complete` are refused unless explicitly overridden with `ALLOW_INCOMPLETE_BACKUP=1` after manual verification.
- Backup machine-local runtime/session data, but exclude OAuth/quota credentials and never restore stale tracked Pi configuration over a fresh clone.

## Questions / Next steps

- [x] Fix and test `backup-to-kingston.sh` and `restore-from-kingston.sh` with isolated fixtures.
- [x] Make bootstrap non-destructive and return a truthful partial/failure status; fix executable modes.
- [x] Remove stale Dotter state and the dangling `cua-driver` link; localize Pi trust state.
- [x] Add strict CI, all-package tests, and a committed npm workspace lockfile.
- [x] Run `mise reshim` and reconcile the Brew bundle unlink mismatch.
- [ ] Mount the encrypted destination, run `just backup-preflight`, then `just backup-workstation`, and perform one restore drill. The workflow is prepared; KingstonPhotos is still not mounted.
- [x] Decide on the macOS application firewall: user declined; leave it disabled.
- [ ] Configure Time Machine after selecting a destination; no destination is currently configured.
- [x] Investigate mise's PATH advisory: generated Nushell activation runs after base PATH setup, managed Node/Python/Go paths already precede `~/dotfiles/pi/agent/bin`, `mise reshim` cleared the actual missing-shim problem, and `just nu-health` passes. No speculative PATH rewrite applied.
- [ ] Independent read-only review remains unavailable because the configured Claude/GPT quota and Gemini five-hour quota are exhausted.
