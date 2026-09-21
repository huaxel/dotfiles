# Dotfiles

Personal multi-platform dotfiles managed with Nix/Home Manager on Unix and
small platform-native scripts on Windows.

For a maintained map of responsibilities, deployment boundaries, and cleanup rules,
see [`docs/repository-map.md`](docs/repository-map.md).

## Quick Start

### macOS — one command

```bash
git clone https://github.com/huaxel/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./bootstrap.sh
```

`bootstrap.sh` installs Homebrew prerequisites → enables git hooks → generates an
age key if missing → Nix + Home Manager → `brew bundle`
(`config/Brewfile`) → `macos/defaults.sh`.

Toggles: `SKIP_BREW_BUNDLE=1`, `SKIP_MACOS_DEFAULTS=1`,
`SKIP_NIX_HOME=1` (leaves Home Manager-owned configs inactive).

> If you already have an age key, restore it to `~/.config/sops/age/keys.txt`
> **before** running bootstrap, or a new key is generated and you must authorize
> it in `.sops.yaml` and rotate secrets (see [Secrets](#secrets)).

### Windows — one command

```powershell
git clone https://github.com/huaxel/dotfiles.git $HOME\dotfiles
cd $HOME\dotfiles
.\bootstrap.ps1
```

`bootstrap.ps1` installs Scoop and configured fonts → enables git hooks →
deploys native Windows configuration with `scripts\deploy-windows.ps1` →
decrypts secrets. Enable Windows Developer Mode (or use an elevated shell) so
configuration symlinks can be created. Restore the existing age key to
`~/.config/sops/age/keys.txt` before bootstrap; missing tools, keys, packages, or
secret decryption now fail the deployment instead of printing false success.

After bootstrap: restart PowerShell, run `glazewm` to start the window manager,
and `zebar` for the status bar. For llama.cpp inference:
`cd ~/.config/llama.cpp; .\start-server.ps1`.

### Linux / manual

```bash
git clone <your-repo> ~/dotfiles && cd ~/dotfiles
./bootstrap.sh
# or activate an existing profile:
just nix-switch juan@framearch   # or juan@arch-wsl / juan@macbook
```

The generic bootstrap leaves host-specific `/etc` configuration untouched. On
the designated Linux inference host, use `INSTALL_SYSTEM_CONFIG=1 ./bootstrap.sh`.

The separate NixOS inference-host profile is intentionally not part of generic
bootstrap. On the target NixOS machine, from this checkout:

```bash
nix flake check --all-systems
nix build '.#nixosConfigurations.framearch.config.system.build.toplevel'
sudo nixos-rebuild build --flake .#framearch
# After verifying the generated system and disk labels:
sudo nixos-rebuild switch --flake .#framearch
```

It expects a root filesystem labelled `nixos` and model storage at the configured
UUID. Do not switch this profile on the existing Arch installation.

## Layout

```
~/dotfiles/
├── flake.nix, flake.lock, home/, nixos/  # Nix/Home Manager (Unix)
├── gitconfig, ssh_config, starship.toml, aerospace, gitignore_global
├── config/ config-linux/ config-macos/   # application configuration
├── powershell/ windows-terminal/ glazewm/ zebar/ autohotkey/  # Windows
├── secrets/                               # sops-encrypted (see secrets/README.md)
├── pi/ skills/                            # agent tooling
├── bin/ scripts/ justfile                 # helpers + CI gate
└── docs/ worksheets/                      # investigations and notes
```

## Templates

Nix/Home Manager renders the Starship hostname color and the platform-specific
llama.cpp model router. The renderer is `scripts/render-llama-models.sh`; it is
run automatically during Home Manager activation. Windows rendering happens in
`scripts/deploy-windows.ps1`.

## Commands

```bash
just ci                 # full local gate (shell, TS, recovery, secrets, nix, ...)
just ci-strict          # same gate, but fail if required tooling is missing
just nix-switch <host>  # activate a Home Manager profile
just nushell-setup      # regenerate shell integrations after tool upgrades
just nu-health          # verify nu config, integrations, keybindings, aliases
just pi-healthcheck     # pi setup health report (also --json)
just check-windows      # static Windows/WSL deployment checks
```

On Windows, run `powershell -ExecutionPolicy Bypass -File scripts\deploy-windows.ps1`.

### Shell

Nushell is the default shell (`config/nushell/`), with Fish kept as a fallback
(`config/fish/config.fish`). `bootstrap.sh` installs Nushell and sets it as the
login shell. Nu differs from Fish in a few ways (semicolon pipes, structured
builtins, `nu -c` skips config) — details and the keybinding/alias map are
generated into `~/.cache/nushell/` and checked by `just nu-health`.

## llama.cpp Models

Model paths are machine-specific. `llama-models.ini` contains both platform
branches, and the renderer writes the correct branch to
`~/.config/llama.cpp/models.ini` during Home Manager activation (or Windows
deployment).

Add or update a model in `llama-models.ini`, then activate the matching profile:

```bash
just nix-switch juan@framearch   # or juan@arch-wsl / juan@macbook
sudo systemctl restart llama.cpp
```

Paths use the HuggingFace Hub cache layout. See `config/llama.cpp/MODELS.md` for
the benchmarked lineup.

## Machine-Specific Config

Per-machine state is kept outside tracked configuration:

- **`npmrc`** — local, gitignored registry credentials; Home Manager links it to
  `~/.npmrc` on Unix, while the Windows deployment script preserves and links it.
- **`~/.config/environment.d/99-environment.conf`** — decrypted machine-local
  secrets and environment variables.
- **Nix host modules** — profile-specific paths and services for each Unix host.

Anything not meant to be shared (work VPN keys, private aliases) belongs in
machine-local files, never in tracked configs.

## WSL (Arch WSL on Windows)

Uses WSL2 **mirrored networking** so Windows VPN routes propagate into WSL.
Windows binaries work via the `WSLInterop` binfmt handler (registered by
`/etc/binfmt.d/wsl.conf`).

For VPN / CIFS mount management use the helper:

```bash
~/dotfiles/scripts/wsl-vpn-setup.sh setup|status|reconnect|mount|route|all
alias vpn-reconnect='~/dotfiles/scripts/wsl-vpn-setup.sh reconnect'
```

The `/mnt/atomsrc` CIFS mount is defined in `/etc/fstab` on the WSL side
(credentials: `~/.smbcred`). `wsl-vpn-setup.sh status` is read-only; use its
`mount` or `all` commands to change mount state.

For VHDX compaction, safe sparse mode is the default. Export/re-import
unregisters the distro and therefore requires both explicit switches after a
separate backup:

```powershell
.\scripts\compact-wsl.ps1 -Distro archlinux -ExportFallback -ConfirmDestructive
```

A verified export is retained if unregister/import fails. The WSL-side script
similarly requires `ALLOW_UNSAFE_SPARSE=true` before using WSL's
`--allow-unsafe` mode.

## New Machine Setup (macOS)

Bootstrap captures most things, but machine-local state must be copied from the
old machine. Use the included scripts:

```bash
# Old machine: connect and unlock the encrypted KingstonPhotos volume first.
# Confirm it is mounted at /Volumes/KingstonPhotos before proceeding.
ls -ld /Volumes/KingstonPhotos
# Then clone latest, verify the encrypted destination, and back up.
git -C ~/dotfiles pull
cd ~/dotfiles && just backup-preflight
just backup-workstation

# New machine: connect/unlock the same volume, verify it, restore keys/state,
# then bootstrap. The restore is destructive to matching local config paths.
ls -ld /Volumes/KingstonPhotos
~/dotfiles/scripts/restore-from-kingston.sh
exec ./bootstrap.sh
```

A successful backup contains `.backup-complete`; the restore script refuses an
unmarked timestamped backup by default. This prevents interrupted or partially
failed copies from looking restorable. For a legacy backup that you have
manually verified, use `ALLOW_INCOMPLETE_BACKUP=1` for that restore only.
`just backup-preflight` intentionally exits non-zero when the volume is absent;
do not bypass that check or run the backup against another path accidentally.
After the first successful backup, perform a restore drill into a disposable
user/config environment or fresh machine and verify keys, Pi sessions, projects,
and shell history before relying on the backup.
Because the backup contains private age/SSH/GPG keys, macOS backups refuse an
unencrypted destination by default. `ALLOW_UNENCRYPTED_BACKUP=1` is an explicit
one-run escape hatch, not a recommended configuration. Machine-local OAuth and
quota credentials are intentionally excluded; sign in again or materialize
them from SOPS on the destination.

### 1. Copy keys (before bootstrap!)

| What | Path | Why |
|---|---|---|
| Age key | `~/.config/sops/age/keys.txt` | decrypts `secrets/*.enc` |
| SSH keys | `~/.ssh/` | git push, server access |
| GPG keys | `~/.gnupg/` | commit signing |

### 2. Clone + bootstrap

```bash
git clone https://github.com/huaxel/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./bootstrap.sh
```

### 3. Sign into accounts

Apple ID (mas), Claude Desktop/Codex (OAuth), Tailscale, Atuin (`atuin login` or
copy db), Zed (Copilot/ACP), Cursor, WakaTime, `pi ghostty theme sync`.

### 4. Copy coding-agent state (post-bootstrap)

| State | Path | Notes |
|---|---|---|
| Pi OAuth | `~/dotfiles/pi/agent/auth.json` | machine-local, **not** synced — run `/login openai-codex` per machine |
| Pi quota cookies | `~/dotfiles/pi/agent/quota-sessions.json` | web cookies for Cursor/CommandCode quota bars (SOPS: `pi-quota-sessions.json.enc`) |
| GitHub Copilot | `~/.config/github-copilot/` | auth tokens |
| Cursor | `~/.cursor/` | re-creatable on sign-in |
| Gemini CLI | `~/.gemini/` | auth, cache; re-auth |
| WakaTime | `~/.wakatime/` | cfg with API key |
| OpenCode | `~/.config/opencode/` | mostly re-installable node_modules |
| Devin / Kimi / Jules / Grok / Orca | `~/.config/devin/`, `~/.kimi-code/`, `~/.jules/`, `~/.grok/`, `~/.orca/` | small configs; copy or recreate |
| Alfred | `~/Library/Application Support/Alfred/` | workflows, snippets, **Powerpack license** (not installed by brew) |
| Itsycal / Logi Options+ / DisplayLink | `~/Library/...` | preferences; brew cask gives the binary only |
| Codex CLI | `~/.codex/` (~236 MB) | auth, history, sessions (optional copy) |
| Claude CLI / Desktop | `~/.claude/`, `~/Library/Application Support/Claude/` | projects, plugins, conversations (optional, large) |
| Shell history | `~/.local/share/atuin/`, `~/.local/share/fish/` | or cloud-sync via `atuin login` |

**Installs fresh (no copy needed):** nvim plugins (Lazy.nvim first launch),
`mise install`, `npm install`, Docker pulls.

## Secrets

Secrets live as sops+age encrypted files in `secrets/` and are materialized by
Home Manager on Unix or `scripts/deploy-secrets.ps1` on Windows. The **full
workflow** — adding a machine key, editing/re-encrypting secrets, and the
pre-commit auto-encrypt
(`*.sha256` plaintext sidecar) — is documented in
[`secrets/README.md`](secrets/README.md).

Key points:

- Shell secrets live in one `environment.d` file → decrypted to
  `~/.config/environment.d/99-environment.conf`, loaded by systemd (Linux) and
  parsed directly by Nushell/Fish/PowerShell.
- `pi/agent/auth.json` (OAuth) is intentionally **not** synced — refresh tokens
  rotate per refresh; each machine owns its own and logs in via `/login`.
- `secrets/*.enc` + `*.sha256` are committed; plaintext and decrypted copies are
  never.
- New machine: add its public age key to `.sops.yaml`, `sops --rotate -in-place`
  each `secrets/*.enc`, commit, pull, then run the matching bootstrap or
  `scripts/deploy-secrets.ps1` on the new machine.
