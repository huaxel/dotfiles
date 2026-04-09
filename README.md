# Dotfiles (Dotter)

Migrated from chezmoi to [dotter](https://github.com/SuperCuber/dotter) for cleaner, simpler dotfile management.

## Why Switch from Chezmoi?

| Chezmoi Pain Point | Dotter Solution |
|-------------------|-----------------|
| `dot_` prefix on every file | Files named exactly as they appear |
| Go template syntax: `{{ if eq .chezmoi.os "darwin" }}` | Handlebars: `{{#if (eq dotter.os "macos")}}` |
| Source files in `~/.local/share/chezmoi` | Files directly in `~/dotfiles` |
| Complex encapsulation | Simple symlink + template model |

## Quick Start

```bash
# 1. Install dotter
cargo install dotter

# 2. Clone this repo
git clone <your-repo> ~/dotfiles
cd ~/dotfiles

# 3. Deploy (creates symlinks)
dotter deploy
```

## File Structure

```
~/dotfiles/
├── .dotter/
│   ├── global.toml      # Main configuration
│   └── local.toml       # Machine-specific settings
├── zshrc                # Template → ~/.zshrc
├── gitconfig            # Template → ~/.gitconfig
├── aerospace            # macOS window manager → ~/.aerospace.toml
├── ideavimrc            # → ~/.ideavimrc
├── gitignore_global     # → ~/.gitignore_global
├── ssh_config           # → ~/.ssh/config (copied, not symlinked)
└── config/              # → ~/.config/
    ├── nvim/
    ├── ghostty/config   # Template for shell integration
    └── ...              # 1000+ other configs
```

## Templates (Handlebars)

OS-specific configuration is much cleaner than chezmoi:

```handlebars
{{#if (eq dotter.os "macos")}}
# macOS-specific config
export PATH="/opt/homebrew/bin:$PATH"
{{/if}}
```

Available variables:
- `dotter.os` - "macos", "linux", "windows"
- `dotter.hostname` - machine name
- `dotter.arch` - architecture
- `name`, `email`, `github_username` - from global.toml

## Commands

```bash
dotter deploy          # Create symlinks and render templates
dotter undeploy        # Remove all symlinks
dotter --dry-run       # Preview changes
dotter watch           # Auto-deploy on file changes
```

## Migrating from Chezmoi

To switch over on a machine currently using chezmoi:

```bash
# 1. Backup current state
chezmoi state dump > ~/chezmoi-backup.json

# 2. Remove chezmoi's files (careful - this removes the actual dotfiles!)
chezmoi destroy

# 3. Deploy with dotter
cd ~/dotfiles
dotter deploy --force

# 4. Reload shell
exec zsh
```

## Chezmoi vs Dotter Syntax

| Task | Chezmoi | Dotter |
|------|---------|--------|
| Rename file | `dot_zshrc.tmpl` | `zshrc` |
| OS conditional | `{{ if eq .chezmoi.os "darwin" }}` | `{{#if (eq dotter.os "macos")}}` |
| Variable | `{{ .chezmoi.os }}` | `{{dotter.os}}` |
| Apply | `chezmoi apply` | `dotter deploy` |

## What's Not Included

Removed from chezmoi migration:
- `sketchybar-app-font/` - This is a separate project (GitHub repo), not a dotfile
- GitHub Actions workflow files with `${{ secrets }}` syntax

These should be installed separately via git clone or package manager.

## Local Machine Config

Create `~/.config/local/zshrc` for machine-specific settings not tracked in git:

```bash
# ~/.config/local/zshrc
export WORK_API_KEY="secret"
alias workvpn="openvpn --config ~/work.ovpn"
```

This is sourced at the end of the main zshrc.
