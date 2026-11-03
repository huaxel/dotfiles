# Repository map

This repository is a personal, multi-platform dotfiles and agent-tool workspace.
Keep deployment paths stable; organize new material under the matching area below.

## Deployment and machine configuration

- `flake.nix`, `flake.lock`, `home/`, and `nix.conf` — Home Manager profiles
  and Unix user configuration.
- `scripts/deploy-windows.ps1` — native Windows configuration links and
  generated files; Scoop remains the package manager.
- `scripts/deploy-secrets.*` — platform-specific sops/age secret materialization.
- `nixos/` — only the shared `cachy-llama-package.nix` (live: feeds the
  `legacyPackages` smoke-test derivations). The future NixOS system modules
  live on the `nixos-framearch-future` branch, not on main.
- `config/` — shared Unix application configuration deployed to `~/.config`
  (includes `config/nushell/` — env.nu/config.nu/login.nu for the Nushell
  shell, managed with `just nushell-setup` / `just nu-health`).
  Exception: `config/ci/` is repo-consumed tooling (runner setup + workflow
  template invoked by justfile), not a deployed `~/.config/ci`.
- `config-linux/` — Linux-only Wayland, launcher, inference, and XKB configuration.
- `config-macos/` — macOS-only configuration.
- Windows roots (`powershell/`, `windows-terminal/`, `autohotkey/`,
  `flow-launcher/`, `config-windows/`) — Windows-specific application files,
  including the LeopardWM scrolling-tiler profile; see
  `docs/patterns/window-management.md`.
- Root dotfiles (`gitconfig`, `ssh_config`, `starship.toml`)
  — remaining source files whose target paths are not naturally grouped
  under `config/`; Unix files are consumed by Home Manager and
  Windows files are linked by `scripts/deploy-windows.ps1`.
- `secrets/` — encrypted inputs only; plaintext and decrypted files stay local.

## Executables and maintenance

- `bootstrap.sh`, `bootstrap.ps1` — first-machine setup.
- `bin/` — small user-facing helper commands that can be installed on `PATH`.
- `scripts/` — workstation backup/restore and platform integration scripts
  (includes `setup-nushell.sh` and `nu-health.sh` for Nushell integration
  generation and health checks). Homelab deployment assets live in the private
  `~/projects/homelab` repository.
- `etc/` — system-level files that are installed explicitly, not by Home Manager.
- `justfile` — local CI, testing, and maintenance entry points.

## Agent tooling and packages

- `AGENTS.md` — shared cross-agent defaults. Home Manager links it to
  `~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`, and `~/.pi/agent/AGENTS.md`;
  Pi's canonical `pi/agent/AGENTS.md` also points here. Pi-specific additions
  stay in `pi/agent/APPEND_SYSTEM.md`, also linked into the fallback profile.
  Project-local instructions still apply. Nondefault Codex/Claude config roots
  remain unmanaged; Codex's global `AGENTS.override.md` can mask the baseline.
- `bin/pi` — tracked Unix entrypoint, deployed as `~/.local/bin/pi`. It selects
  `pi/agent/` when `PI_CODING_AGENT_DIR` is unset, including reset environments,
  while preserving explicit profile/session overrides. It uses the existing
  managed release selected by `pi/agent/install/current-version`; neither
  generated `pi/agent/bin/pi` nor downloaded release files are patched. Node
  comes from the existing installer runtime, PATH, or mise shims, without a new
  installation. Nushell restores the owned entrypoint ahead of generated ones.
  Native Windows retains its generated `.cmd` launcher.
  The existing `~/projects/pi-extensions/pi-subagent/index.ts` is an optional
  extension only on Linux inside Herdr, with `flock` and `herdr` available.
  The launcher never injects it into alternate profiles, package commands, or
  `--no-extensions` invocations. Mac and missing-checkout launches skip it.
- `scripts/agent_setup.py` — `just doctor-agents` checks the local links without
  inference or writes. `python3 scripts/agent_setup.py apply` applies only those
  five entrypoints, retaining replaced files/symlinks under
  `~/.local/state/dotfiles/agent-backups/`. It refuses directory collisions;
  this is a targeted local rollout, not a Home Manager profile activation.
  Normal declarative deployment is `just nix-switch <profile>`; use a fresh
  shell afterward so the new PATH is selected. `just check-agents` runs isolated
  fixtures in CI without changing the real home or starting an agent.
- `pi/agent/` — tracked Pi configuration, extensions, skills, and package sources.
  The tracked `settings.json` is the source of truth. Home Manager also links it
  into `~/.pi/agent/settings.json` for clients bypassing the owned launcher;
  this alias alone is not a complete profile mirror. SDK callers bypassing the
  launcher must select the canonical agent directory themselves. The Windows
  deployment script handles native Windows state. Machine-local fields (`lastChangelogVersion`, `defaultProvider`, `defaultModel`) are
  stripped on commit by the `strip-pi-machine-config` git clean filter
  (`.gitattributes`), so pi writing them back through the symlink does not
  create git noise. **Caution:** an autostash/rebase pull with local changes to
  this file can run those changes through the clean filter; the working copy
  may then contain stripped defaults (and pi may ask you to choose them again).
  The same compat-symlink pattern is used for `auth.json`
  (ad-hoc after `/login`, since auth is gitignored per-machine).
- Published Pi packages live in `~/projects/pi-extensions/` (separate working
  collection, one directory per package, published to npm under `@juanbenjumea`),
  not in this repository. The runtime consumes them from the registry; the only
  tree-local Pi code is `pi/agent/extensions/`.
- `skills/` — reusable skills shared by agents and projects. See
  [`skills/README.md`](../skills/README.md) for ownership, harness selection,
  and catalog verification.

## Documentation and investigations

- `README.md` — installation, workstation bootstrap, backup/restore, and secrets guide.
- Homelab operations and machine inventory — private `huaxel/homelab` repository.
- `docs/` — durable operational patterns, design documents, and investigations.
- `docs/investigations/pi-health-check/` — findings and decision tickets for the
  Pi health-check project; keep new investigation material here.
- `PLAN.md`, `FEEDBACK.md` — repository-level backlog and session feedback.
  Pre-2026-08 feedback entries are archived in `docs/feedback-archive.md`.

## Local-only directories

These are machine state, not portable configuration. Do not clean them with a
repository-wide delete unless you have reviewed their contents first:

- `node_modules/` — npm workspace install.
- `pi/agent/` runtime caches and sessions — generated by Pi.
- `prime-agent` (external, at `$HOME/prime-agent`) — runtime agent tooling; not in this repo.
- `.pi-glla/`, `.herdr-todo/`, and `.worksheets/` — local
  tool state or collaboration artifacts.

## Cleanup rules

1. Prefer deleting stale backups and generated files over moving deployment
   sources.
2. Before moving a file, update the relevant Home Manager module or deployment
   script, README links, and any package manifests that reference it.
3. Keep machine-specific values in the host module or decrypted
   `~/.config/environment.d/99-environment.conf`.
4. Keep secrets encrypted in git and never add plaintext credentials.
