# Secrets Management Without 1Password CLI

Since you've moved to iCloud Passwords, here are iCloud-friendly alternatives for managing secrets in your dotfiles:

## Option 1: macOS Keychain (Native iCloud Integration) ⭐ Recommended

macOS Keychain syncs via iCloud and works great with dotfiles:

```bash
# Add to dot_zshrc.tmpl or dot_config/private_fish/config.fish
{{ if eq .chezmoi.os "darwin" }}
# Load secrets from macOS Keychain
export GITHUB_TOKEN=$(security find-generic-password -s "github-token" -w 2>/dev/null)
export OPENAI_API_KEY=$(security find-generic-password -s "openai-api-key" -w 2>/dev/null)
{{ end }}
```

**Setup:**
1. Open Keychain Access
2. Add passwords with "generic password" type
3. Set Service Name to match what you use in scripts (e.g., "github-token")
4. Enable "iCloud Keychain" in System Settings → Apple ID → iCloud

**Pros:**
- ✅ Native iCloud sync
- ✅ No additional CLI tools
- ✅ Biometric auth (Touch ID/Face ID)
- ✅ Secure enclave storage

**Cons:**
- ❌ macOS only (use GitHub Secrets for CI)
- ❌ Slightly slower (keychain lookup)

---

## Option 2: GitHub Secrets (For CI Only)

Store secrets in GitHub for CI workflows, manually manage locally:

```yaml
# .github/workflows/test.yml
- name: Test with secrets
  env:
    TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
  run: |
    # Use secret in tests
    echo "Testing with provided credentials..."
```

**Setup:**
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add repository secrets

**Pros:**
- ✅ Works in CI
- ✅ Encrypted at rest
- ✅ No local tooling needed

**Cons:**
- ❌ Not for local development
- ❌ Still need local solution

---

## Option 3: GPG + Chezmoi Encryption

Chezmoi supports encrypting specific files with GPG:

```bash
# Encrypt a file
chezmoi add --encrypt ~/.ssh/config

# Result: encrypted file in repo
dot_ssh/encrypted_config.asc
```

**Setup:**
1. Create GPG key: `gpg --gen-key`
2. Add to chezmoi: `chezmoi add --encrypt ~/.ssh/config`
3. On new machine: import GPG key first

**Pros:**
- ✅ Works cross-platform
- ✅ Secure encryption
- ✅ Integrates with chezmoi

**Cons:**
- ❌ Need to manage GPG keys
- ❌ Doesn't sync via iCloud

---

## Option 4: Pass (Unix Password Store) + iCloud Drive

Store passwords in encrypted files synced via iCloud Drive:

```bash
# Install pass
brew install pass  # macOS
sudo apt install pass  # Debian/Ubuntu

# Initialize with your GPG key
pass init "Your Name"

# Store secrets
pass insert github/token
pass insert openai/api-key

# Use in dotfiles
export GITHUB_TOKEN=$(pass github/token)
```

**Setup with iCloud:**
1. Create `~/.password-store` directory
2. Move it to iCloud Drive: `mv ~/.password-store ~/Library/Mobile\ Documents/com~apple~CloudDocs/password-store`
3. Symlink back: `ln -s ~/Library/Mobile\ Documents/com~apple~CloudDocs/password-store ~/.password-store`

**Pros:**
- ✅ Standard Unix tool
- ✅ Syncs via iCloud Drive
- ✅ Works on Linux too (with iCloud web or dual sync)
- ✅ Git integration available

**Cons:**
- ❌ Requires GPG setup
- ❌ Manual iCloud symlink setup

---

## Option 5: Bitwarden CLI (Free Alternative)

If you want a CLI tool similar to 1Password but free:

```bash
# Install
brew install bitwarden-cli  # macOS
npm install -g @bitwarden/cli  # or via npm

# Login (once)
bw login

# Use in dotfiles
export GITHUB_TOKEN=$(bw get password github-token)
```

**Pros:**
- ✅ Free personal account
- ✅ CLI similar to 1Password
- ✅ Cross-platform
- ✅ Good browser integration

**Cons:**
- ❌ Not iCloud (separate sync)
- ❌ Another tool to manage

---

## Option 6: Environment File Template (Simplest)

Keep secrets out of dotfiles entirely, use local env files:

```bash
# dot_zshrc.tmpl
# Load local secrets if they exist
if [[ -f ~/.config/local/secrets.env ]]; then
  source ~/.config/local/secrets.env
fi
```

```bash
# ~/.config/local/secrets.env (never committed!)
export GITHUB_TOKEN=ghp_xxx
export OPENAI_API_KEY=sk-xxx
```

**Pros:**
- ✅ Simple, no dependencies
- ✅ Works everywhere
- ✅ Full control

**Cons:**
- ❌ Manual sync between machines
- ❌ No iCloud integration

---

## 🎯 Recommended Setup for iCloud Users

**For macOS + Linux workflow:**

1. **macOS**: Use Keychain with iCloud sync
2. **Linux**: Use GPG-encrypted file or pass with manual sync
3. **CI**: Use GitHub Secrets
4. **Fallback**: Local `~/.config/local/secrets.env`

**Template approach:**

```bash
# dot_zshrc.tmpl
{{ if eq .chezmoi.os "darwin" }}
# macOS: Load from Keychain
export GITHUB_TOKEN=$(security find-generic-password -s "github-token" -w 2>/dev/null || echo "")
{{ else }}
# Linux: Load from local env file
if [[ -f ~/.config/local/secrets.env ]]; then
  source ~/.config/local/secrets.env
fi
{{ end }}
```

---

## 🔒 Security Best Practices

1. **Never commit raw secrets** - Always use encryption or external storage
2. **Use .chezmoiignore** - Exclude secret files from being added accidentally
3. **Audit your repo** - Run `git log --all --full-history -- .env` to check for leaked secrets
4. **Rotate if leaked** - If a secret ever hits the repo, rotate it immediately
5. **Pre-commit hook** - Already set up to block common secret patterns

---

## 🚀 Quick Start: macOS Keychain

```bash
# 1. Add your first secret to Keychain
security add-generic-password -s "github-token" -a "$USER" -w "ghp_your_token_here"

# 2. Test retrieval
security find-generic-password -s "github-token" -w

# 3. Add to your zshrc template (already done!)
# export GITHUB_TOKEN=$(security find-generic-password -s "github-token" -w 2>/dev/null)

# 4. Apply changes
dots apply
source ~/.zshrc

# 5. Verify
echo $GITHUB_TOKEN  # Should show your token
```

The token is now:
- ✅ Stored in macOS Keychain
- ✅ Synced via iCloud to your other Macs
- ✅ Protected by Touch ID/Face ID
- ✅ Never in your dotfiles repo
