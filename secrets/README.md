# Secrets (sops + age)

This directory contains **encrypted** secrets that sync across machines via git.

## How it works

1. **Encrypt** a secret file with `sops --encrypt`
2. **Commit** the `.enc` file to this repo
3. **Pull** on another machine
4. **`dotter deploy`** auto-decrypts secrets to their target paths via `post_deploy.sh` (or `post_deploy.ps1` on Windows)

## Secret sources

| Encrypted file | Decrypts to | Used by |
| --- | --- | --- |
| `environment.d.enc` | `~/.config/environment.d/99-environment.conf` | All shells (Nushell + Fish fallback). systemd `environment.d` loads it for user sessions on Linux; Nushell/Fish/PowerShell also parse it directly where systemd is absent. Also the **single** synced source for Pi's static API-key providers (OPENCODE_KEY, CURSOR_API_KEY, NOUS_API_KEY, …) across machines. |
| `pi-quota-sessions.json.enc` | `~/dotfiles/pi/agent/quota-sessions.json` | Pi quota/sessions |
| `llama-webui-config.json.enc` | `~/.config/llama.cpp/webui-config.json` | llama.cpp Web UI |

> **`pi/agent/auth.json` is NOT synced.** OpenAI Codex (and other OAuth
> providers such as `meta` and `commandcode`) use **single-use refresh tokens**
> that rotate on every refresh. Sharing one credential across machines desyncs
> them — whichever machine refreshes first invalidates the others'
> refresh tokens (`refresh_token_reused`). Instead, each machine owns its own
> gitignored `pi/agent/auth.json` and runs `/login openai-codex` (and any other
> OAuth provider) independently. Static API-key providers continue to work
> across machines via the synced `environment.d` env vars.

> `environment.d.enc` is the **single** secret source for shell environment
> variables. The old `env.fish.enc` has been removed; its keys were merged into
> `environment.d.enc` (26 keys total).

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

### 2. Create / edit a secret file

The canonical shell-secret file is the systemd `environment.d` file:

```bash
# Edit the decrypted plaintext at the deployed path:
$EDITOR ~/.config/environment.d/99-environment.conf
# Syntax: one KEY=value per line; comments start with #
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Re-encrypt and commit

The `.githooks/pre-commit` hook auto-re-encrypts the `environment.d` file from
its decrypted plaintext when the content changes, so you can just edit the
deployed file and commit — no manual `sops --encrypt` needed.

```bash
git add secrets/environment.d.enc secrets/environment.d.sha256
git commit
```

To encrypt manually instead:

```bash
cd ~/dotfiles/secrets
sops --encrypt --input-type binary \
  ~/.config/environment.d/99-environment.conf > environment.d.enc
# Linux: sha256sum; macOS: shasum -a 256
(sha256sum ~/.config/environment.d/99-environment.conf 2>/dev/null || shasum -a 256 ~/.config/environment.d/99-environment.conf) | awk '{print $1}' > environment.d.sha256  # see note below on sidecar
```

### 4. Use it in your shell

- **Linux**: systemd loads `~/.config/environment.d/` for user sessions
  automatically — log out/in (or start a new session) after `dotter deploy`.
- **Nushell / Fish**: also parse the file directly at startup, so the keys are
  available even without a full session restart.
- **PowerShell**: `powershell/Load-Secrets.ps1` sources the same file.

## Files

- `*.enc` — encrypted secrets (committed to git)
- `~/.config/environment.d/99-environment.conf` — decrypted shell secrets (never committed, 600 permissions)
- `~/.config/secrets/` — decrypted app-specific secrets (never committed)

## Auto-encrypt on commit

The `.githooks/pre-commit` hook auto-re-encrypts `environment.d` (and the
app-specific secrets) when their decrypted plaintext changes. It guards
re-encryption with a SHA256 sidecar (`*.sha256` storing the **plaintext**
content hash) so sops's random nonce doesn't produce spurious diffs on every
commit.

Enable hooks on a fresh clone:

```bash
git config core.hooksPath .githooks
```

`bootstrap.sh` does this automatically.
