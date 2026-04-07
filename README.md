# Dotfiles

> Cross-platform dotfiles managed with [chezmoi](https://www.chezmoi.io/)

[![Test Dotfiles Bootstrap](https://github.com/huaxel/dotfiles/actions/workflows/test.yml/badge.svg)](https://github.com/huaxel/dotfiles/actions/workflows/test.yml)

## 🚀 Quick Start

### Install on a New Machine

```bash
# Install chezmoi and apply dotfiles
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply huaxel
```

Or using the bootstrap script:
```bash
curl -fsSL https://raw.githubusercontent.com/huaxel/dotfiles/master/run_once_bootstrap.sh | bash
```

## 📁 Repository Structure

```
.
├── dot_config/
│   ├── nvim/              # LazyVim configuration
│   ├── private_fish/      # Fish shell config
│   ├── admin-scripts/     # Helper scripts
│   └── ...
├── dot_zshrc.tmpl         # Zsh configuration (cross-platform)
├── dot_gitconfig.tmpl     # Git configuration (cross-platform)
├── run_once_*.sh          # Setup scripts per OS
└── .chezmoi.toml.tmpl     # Chezmoi configuration
```

## 🛠️ Supported Platforms

| OS | Status | Setup Script |
|----|--------|--------------|
| macOS | ✅ Full support | `run_once_bootstrap.sh` |
| Arch Linux | ✅ Full support | `run_once_50_arch_setup.sh` |
| Debian/Ubuntu | ✅ Full support | `run_once_50_debian_setup.sh` |
| WSL | ✅ Supported | `run_once_50_wsl_setup.sh` |

## ⚡ Commands

Use the `dots` helper script:

```bash
dots apply          # Apply dotfiles to system
dots status         # Show what would change
dots diff           # Show detailed diff
dots add <file>     # Add file to chezmoi
dots edit <file>    # Edit a tracked file
dots git <cmd>      # Run git in chezmoi repo
dots push           # Commit and push changes
dots update         # Pull latest and apply
dots cd             # Enter chezmoi source directory
```

## 🔧 Key Features

### Cross-Platform Shell
- **Zsh** with oh-my-zsh on macOS
- **Fish** on Linux
- Starship prompt on both
- Consistent aliases via `dots` helper

### Neovim (LazyVim)
- Pre-configured language support: Python, TypeScript, PHP, SQL
- GitHub Copilot integration
- CodeCompanion AI chat
- Custom conform formatting

### Development Tools
- chezmoi for dotfiles management
- fzf, ripgrep, fd, bat, eza
- starship prompt
- zoxide (smart cd)

## 🔒 Secrets Management

Sensitive files are excluded via `.chezmoiignore`:
- SSH keys (`~/.ssh/id_*`)
- Environment files (`**/.env*`)
- GPG keys (`~/.gnupg/`)

For secrets, use:
- **macOS**: 1Password CLI (`op`)
- **Linux**: Native keyring or encrypted files

See [docs/secrets-management.md](docs/secrets-management.md) for detailed iCloud-friendly options.

## 📝 Machine-Specific Config

Create local overrides (not tracked by git):

```bash
# Fish
~/.config/fish/local.fish

# Zsh
~/.config/local/zshrc
```

## 🔄 Keeping In Sync

```bash
# Update to latest
dots update

# See what's changed
dots diff

# Apply changes
dots apply
```

## 🐛 Troubleshooting

### Bootstrap fails
```bash
# Check OS detection
echo $OSTYPE

# Run specific setup
bash ~/.local/share/chezmoi/run_once_50_arch_setup.sh
```

### Chezmoi issues
```bash
# Debug mode
chezmoi --verbose apply

# Check data
chezmoi data

# Doctor
chezmoi doctor
```

## 📜 License

MIT - Feel free to fork and customize!

---

**Maintained by:** [Juan Benjumea](https://github.com/huaxel)
