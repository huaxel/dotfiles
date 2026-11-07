# Dotfiles

Personal cross-platform configuration: Nix/Home Manager on Unix, native scripts on Windows. See the [repository map](docs/repository-map.md) for structure and boundaries; homelab operations live in the private [homelab repo](https://github.com/huaxel/homelab).

## Quick start

```bash
# macOS or Linux
git clone https://github.com/huaxel/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./bootstrap.sh
```

```powershell
# Windows
git clone https://github.com/huaxel/dotfiles.git $HOME\dotfiles
cd $HOME\dotfiles; .\bootstrap.ps1
```

**Existing age key?** Restore it to `~/.config/sops/age/keys.txt` before bootstrap. Otherwise, a new key is generated and must be added to `.sops.yaml` before secrets can be decrypted. See [Secrets](secrets/README.md).

Linux bootstrap leaves host-specific `/etc` configuration untouched. Use `INSTALL_SYSTEM_CONFIG=1 ./bootstrap.sh` only on the designated inference host. The NixOS migration is on `nixos-framearch-future`; do not activate it on Arch.

## Useful commands

```bash
just ci                 # full local checks
just ci-strict          # fail if required check tools are missing
just nix-switch <host>  # activate a Home Manager profile
just windows-deploy     # deploy Windows configuration
just nu-health          # check Nushell configuration
just pi-healthcheck     # check Pi setup (--json supported)
just check-windows      # static Windows/WSL checks
```

Nushell is the default shell; Fish is a minimal fallback. llama.cpp model paths are maintained in `llama-models.ini` and rendered during activation. See [`config/llama.cpp/MODELS.md`](config/llama.cpp/MODELS.md).

## New Mac checklist

Back up and restore machine-local state with `just backup-preflight`, `just backup-workstation`, and `scripts/restore-from-kingston.sh`. Backups contain private keys: use an encrypted destination, verify the mounted volume, and test a restore before relying on it. Restore age, SSH, and GPG keys **before** bootstrap; sign into accounts and recreate machine-local OAuth after. See the backup scripts for safeguards and options.

## Secrets and local state

SOPS/age secrets are materialized by Home Manager or `scripts/deploy-secrets.ps1`. Full key, editing, and rotation instructions are in [`secrets/README.md`](secrets/README.md). Never commit plaintext secrets or machine-local credentials; OAuth tokens are per-machine and are not synced.

For WSL VPN/mount operations, see `scripts/wsl-vpn-setup.sh`; compaction safeguards are documented in `scripts/compact-wsl.ps1`.
