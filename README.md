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

---

## Secrets Management (sops + age)

Encrypted secrets live in the dotfiles repo and auto-decrypt on `dotter deploy`.

### Prerequisites

```bash
# macOS
brew install sops age

# Arch Linux
pacman -S sops age

# Ubuntu/Debian
# Download from https://github.com/getsops/sops/releases
# and https://github.com/FiloSottile/age/releases
```

### Setup on a new machine

**1. Generate an age key** (one per machine):

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
```

This prints a **public key** like `age1xxx...`. Add it to `.sops.yaml` in the dotfiles repo so this machine can decrypt:

```bash
cd ~/dotfiles
# Edit .sops.yaml and add the new public key to the age list
git add .sops.yaml
git commit -m "feat(secrets): add <machine-name> age key"
git push
```

**2. Pull and deploy**:

```bash
cd ~/dotfiles && git pull
dotter deploy
# → secrets auto-decrypt to ~/.agents/secrets/
```

### How to add a secret

**1. Create the plaintext file** (never commit this):

```bash
cat > ~/dotfiles/secrets/env.sh <<'EOF'
export FIREWORKS_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"
EOF
```

**2. Encrypt it**:

```bash
cd ~/dotfiles/secrets
sops --encrypt env.sh > env.sh.enc
```

**3. Remove plaintext and commit encrypted**:

```bash
rm env.sh
cd ~/dotfiles
git add secrets/env.sh.enc
git commit -m "chore(secrets): add API keys"
git push
```

### How to use decrypted secrets

**Fish** (`~/.config/fish/config.fish`):
```fish
if test -f ~/.agents/secrets/env.sh
    source ~/.agents/secrets/env.sh
end
```

**Zsh/Bash** (`~/.zshrc`):
```bash
[ -f ~/.agents/secrets/env.sh ] && source ~/.agents/secrets/env.sh
```

### What gets encrypted vs. what's ignored

| Tracked in git | Ignored |
|---|---|
| `secrets/*.enc` | `secrets/*` (plaintext) |
| `secrets/README.md` | `~/.agents/secrets/` (decrypted) |
| `.sops.yaml` | `~/.config/sops/age/keys.txt` |

### Adding a new machine to decrypt existing secrets

If you have a new machine that needs to read existing secrets:

1. Generate age key on new machine
2. Add the **public key** to `.sops.yaml` (comma-separated)
3. **Re-encrypt all secrets** so the new key is included:

```bash
cd ~/dotfiles/secrets
for f in *.enc; do
  sops --rotate -in-place "$f"
done
git add *.enc
git commit -m "chore(secrets): rotate keys for new machine"
git push
```

Then on the new machine:
```bash
cd ~/dotfiles && git pull && dotter deploy
```

### Troubleshooting

**"Failed to decrypt"** — wrong age key:
```bash
# Verify your key exists
cat ~/.config/sops/age/keys.txt

# Check which keys the file was encrypted for
sops --encrypt --show-master-keys secrets/env.sh.enc
```

**"sops: command not found"** — install it:
```bash
# Arch
pacman -S sops
# macOS
brew install sops
```

**Secrets not decrypting on deploy** — check the post-deploy hook ran:
```bash
cd ~/dotfiles && dotter deploy 2>&1 | tail -20
# Should show: "🔐 Decrypting env.sh..."
```

### Full example: adding a Fireworks API key

```bash
# 1. Create the secret
cat > ~/dotfiles/secrets/fireworks.env <<'EOF'
export FIREWORKS_API_KEY="fw-abc123..."
EOF

# 2. Encrypt
cd ~/dotfiles/secrets
sops --encrypt fireworks.env > fireworks.env.enc

# 3. Clean up
cd ~/dotfiles
rm secrets/fireworks.env

# 4. Commit
git add secrets/fireworks.env.enc
git commit -m "chore(secrets): add fireworks api key"
git push

# 5. Source it in your shell
echo '[ -f ~/.agents/secrets/fireworks.env ] && source ~/.agents/secrets/fireworks.env' >> ~/.zshrc
```

On the next `dotter deploy`, the secret decrypts automatically.
