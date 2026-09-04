# Dotfiles (Dotter)

Personal multi-platform dotfiles managed with [dotter](https://github.com/SuperCuber/dotter):
symlinked files + Handlebars templates, deployed across macOS, Linux (Arch/WSL),
and Windows. (Migrated from chezmoi; see git history.)

For a maintained map of responsibilities, deployment boundaries, and cleanup rules,
see [`docs/repository-map.md`](docs/repository-map.md).

## Quick Start

### macOS — one command

```bash
git clone https://github.com/huaxel/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./bootstrap.sh
```

`bootstrap.sh` installs Homebrew → dotter + git + age + sops + mas → enables git
hooks → generates an age key if missing → `dotter deploy` → `brew bundle`
(`config/Brewfile`) → `macos/defaults.sh`.

Toggles: `SKIP_BREW_BUNDLE=1`, `SKIP_MACOS_DEFAULTS=1`.

> If you already have an age key, restore it to `~/.config/sops/age/keys.txt`
> **before** running bootstrap, or a new key is generated and you must authorize
> it in `.sops.yaml` and rotate secrets (see [Secrets](#secrets)).

### Linux / manual

```bash
cargo install dotter
git clone <your-repo> ~/dotfiles && cd ~/dotfiles
dotter deploy          # symlink + render (or run ./bootstrap.sh)
```

The generic bootstrap leaves host-specific `/etc` configuration untouched. On
the designated Linux inference host, use `INSTALL_SYSTEM_CONFIG=1 ./bootstrap.sh`.

## Layout

```
~/dotfiles/
├── .dotter/global.toml    # deployment config; local.toml = per-machine vars
├── gitconfig, ssh_config, starship.toml, aerospace, gitignore_global
├── config/                # shared ~/.config apps (nvim, ghostty, fish, ...)
├── config-linux/ config-macos/   # per-OS app config
├── home/ nixos/ flake.nix # Home Manager / NixOS (Unix hosts)
├── powershell/ windows-terminal/ glazewm/ zebar/ autohotkey/  # Windows
├── secrets/               # sops-encrypted (see secrets/README.md)
├── pi/  skills/   # agent tooling (pi config, skills)
├── bin/  scripts/  justfile     # helpers + CI gate
└── docs/  worksheets/           # investigations, patterns, session notes
```

## Templates

Files are named exactly as deployed; Handlebars branches on per-machine variables
from `.dotter/local.toml` (`bootstrap.sh` writes it on first run):

```handlebars
{{#if (eq os "macos")}}
export PATH="/opt/homebrew/bin:$PATH"
{{/if}}
```

Variables: `os` (`macos`|`linux`|`windows`, set explicitly), `name`, `email`,
`hostname_color`, `models_base_path`. `github_username` is defined only in
`[windows.variables]`. Reference them as `{{os}}`, `{{name}}`, etc.

## Commands

```bash
dotter deploy / undeploy / --dry-run / watch
just ci                 # full local gate (shell, TS, dotter, secrets, nix, ...)
just nushell-setup      # regenerate shell integrations after tool upgrades
just nu-health          # verify nu config, integrations, keybindings, aliases
just pi-healthcheck     # pi setup health report (also --json)
```

### Shell

Nushell is the default shell (`config/nushell/`), with Fish kept as a fallback
(`config/fish/config.fish`). `bootstrap.sh` installs Nushell and sets it as the
login shell. Nu differs from Fish in a few ways (semicolon pipes, structured
builtins, `nu -c` skips config) — details and the keybinding/alias map are
generated into `~/.cache/nushell/` and checked by `just nu-health`.

## llama.cpp Models

Model paths are machine-specific, so the router config is a template
(`llama-models.ini`). Each machine's `.dotter/local.toml` sets `models_base_path`,
and the template branches on `os` (Linux → Vulkan/RADV with MTP speculative
decoding; macOS → Metal, smaller model set).

```toml
[variables]
os = "linux"
name = "Juan Benjumea"
email = "benjumeamoreno@gmail.com"
hostname_color = "fg:#f7768e"
models_base_path = "/mnt/ai_models/models"   # macOS: ~/.cache/huggingface/hub
```

Add or update a model in `llama-models.ini`, then:

```bash
cd ~/dotfiles && dotter deploy --force && sudo systemctl restart llama.cpp
```

Paths use the HuggingFace Hub cache layout:
`{{ models_base_path }}/models--author--model-GGUF/snapshots/<hash>/file.gguf`.
See `config/llama.cpp/MODELS.md` for the benchmarked lineup.

## Machine-Specific Config

Per-machine settings live in two places:

- **`.dotter/local.toml`** — the variables used by templates (`os`, `name`,
  `email`, `hostname_color`, `models_base_path`). `bootstrap.sh` writes this on
  first run; edit it before re-deploying on a new machine.
- **`~/.config/environment.d/99-environment.conf`** — machine-local secrets and
  env vars (decrypted by the post-deploy hook; see
  [`secrets/README.md`](secrets/README.md)). Loaded by systemd and parsed by the
  shell configs.

Anything not meant to be shared (work VPN keys, private aliases) belongs in
those machine-local files, never in tracked configs.

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
(credentials: `~/.smbcred`).

## New Machine Setup (macOS)

Bootstrap captures most things, but machine-local state must be copied from the
old machine. Use the included scripts:

```bash
# Old machine: clone latest, then back everything up
git -C ~/dotfiles pull && ~/dotfiles/scripts/backup-to-kingston.sh

# New machine: restore keys FIRST, then bootstrap
~/dotfiles/scripts/restore-from-kingston.sh
exec ./bootstrap.sh
```

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

Secrets live as sops+age encrypted files in `secrets/` and auto-decrypt on
`dotter deploy` via the post-deploy hook. The **full workflow** — adding a
machine key, editing/re-encrypting secrets, and the pre-commit auto-encrypt
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
  each `secrets/*.enc`, commit, pull + `dotter deploy` on the new machine.
