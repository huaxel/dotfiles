# Hosts

One row per machine: what it is, which profile it runs, and where its
truth lives. When a value can live in exactly one place, this file says
which. See also: `docs/patterns/window-management.md` (tilers),
`docs/repository-map.md` (tree layout).

| Host | OS / arch | Profile | Role |
|---|---|---|---|
| framearch | Arch Linux, x86_64 | `juan@framearch` | desktop (niri) + llama.cpp inference host |
| arch-wsl | Arch WSL2, x86_64 | `juan@arch-wsl` | terminal-only WSL sidecar for Windows |
| macbook | macOS, aarch64 | `juan@macbook` | portable daily driver (OmniWM + borders) |
| liedelpi | Pi 5 headless, aarch64 | `juan@liedelpi` | media, DNS, CI runners, deploy target |
| Windows laptop | Windows 11 | `bootstrap.ps1` + `just windows-deploy` | LeopardWM, WSL2; two- or three-monitor docks |

## Per-host notes

- **framearch** owns `/opt/cachy-llama`, `/mnt/ai_models` (ext4, UUID
  `fcef66f9…`), the Home Manager `memoryfield-embed` user service, and the
  Niri session. Bar: Noctalia experiment in progress, waybar kept as the
  revert path (`config-linux/niri/config.kdl`).
- **arch-wsl** uses WSL2 mirrored networking so Windows VPN routes propagate.
  No compositor mappings by design. VPN/CIFS via
  `scripts/wsl-vpn-setup.sh`; CIFS mount in `/etc/fstab` (creds
  `~/.smbcred`); compaction via `scripts/compact-wsl.sh` (sparse default).
- **macbook** keeps Homebrew for GUI/macOS-integrated tools only (no CLI
  duplicates of the Nix profile). sops-nix needs the launchd
  bootout-then-bootstrap workaround in `home/macbook.nix`.
- **liedelpi** deliberately skips `linux-desktop.nix` (headless). Home-server
  deploy target for `just register-project` / `just deploy-server`.
- **Windows laptop** is deployed by `deploy-windows.ps1` (symlink → junction
  → copy fallback) plus Scoop for packages. LeopardWM’s profile targets the
  focused monitor so window placement can adapt between the home and work docks.

## Where truth lives

- **Shared non-secret env** → `config/environment.d/10-dotfiles.conf`
  (deployed by `home/common.nix`, parsed by both shells + systemd).
- **Secrets** → `secrets/*.enc` (sops+age, per-host recipients in
  `.sops.yaml`), materialized to `~/.config/environment.d/99-environment.conf`.
- **Host-specific paths/services** → the host's `home/*.nix` module only.
  Never in shell configs (they read env.d) and never hardcoded per machine
  in shared files — use `$HOME`-relative or `hostname` branches as a last
  resort, and say why in a comment.
- **New machines** follow README's backup/restore flow; add the row here
  when the host is real, not before.
