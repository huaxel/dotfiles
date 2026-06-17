# Secrets (sops + age)

This directory contains **encrypted** secrets that sync across machines via git.

## How it works

1. **Encrypt** a secret file with `sops --encrypt`
2. **Commit** the `.enc` file to this repo
3. **Pull** on another machine
4. **`dotter deploy`** auto-decrypts secrets to `~/.config/secrets/` via `post_deploy.sh`

## Quick start

### 1. Add your age key to the repo (for other machines)

The public key from `~/.config/sops/age/keys.txt` is already in `.sops.yaml`.
For other machines to decrypt, add their public keys to `.sops.yaml`:

```yaml
creation_rules:
  - path_regex: secrets/.*$
    age: >
      age13tmsqsgvls98xku94mc53t0tn9et450nfkmydqrpl380cytt0pwsl7s8zl,
      age1<other-machine-key>
```

### 2. Create a secret file

Example: `env.fish` with API keys

```fish
# ~/.config/secrets/env.fish
set -x FIREWORKS_API_KEY "your-key-here"
set -x OPENAI_API_KEY "your-key-here"
set -x ANTHROPIC_API_KEY "your-key-here"
```

### 3. Encrypt it

```bash
cd ~/dotfiles/secrets
sops --encrypt env.fish > env.fish.enc
```

### 4. Remove the plaintext and commit

```bash
rm env.fish
git add env.fish.enc
```

### 5. Use it in your shell

Add to `~/.config/fish/config.fish`:
```fish
if test -f ~/.config/secrets/env.fish
    source ~/.config/secrets/env.fish
end
```

Or in `~/.zshrc`:
```bash
[ -f ~/.config/secrets/env.fish ] && . ~/.config/secrets/env.fish
```

## Files

- `*.enc` — encrypted secrets (committed to git)
- `~/.config/secrets/` — decrypted secrets (never committed, 600 permissions)

## Auto-encrypt on commit

The `.githooks/pre-commit` hook auto-re-encrypts `env.fish` when you commit.
No manual `sops --encrypt` needed — just edit `~/.config/secrets/env.fish` and commit.

Enable hooks on a fresh clone:
```bash
git config core.hooksPath .githooks
```

Or run `bootstrap.sh` which does this automatically.
