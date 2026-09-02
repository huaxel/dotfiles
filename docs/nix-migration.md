# Nix/Home Manager migration

This repository is migrating user-environment management from Dotter toward
Home Manager. The migration is intentionally incremental.

## Current pilot

`flake.nix` exposes three Home Manager profiles:

```text
juan@framearch   x86_64-linux
juan@arch-wsl    x86_64-linux
juan@macbook     aarch64-darwin
```

The pilot manages a shared package baseline, the Brewfile, session variables,
the two framearch user systemd services, Nushell, Starship, Git, the global Git ignore
file, Neovim, Ghostty, mise, Herdr, the static CI tree, the tracked Zed
keymap, eza, the shared icon helper, the web-search wrapper, the static llama
project files, the llama statistics bridge script, and the three encrypted secret
destinations through sops-nix. Dotter remains the owner of the remaining
configuration paths. Do not run
`home-manager switch` after adding a file to `home.file` until the matching
Dotter mapping has been removed; two managers must never own the same path.

Validate from a machine with Nix installed:

```bash
nix flake check --all-systems
just nix-check juan@framearch
```

`just ci` also runs the flake check when Nix is installed; this includes an
inert enabled-module evaluation for graphics, model storage, service users, and
port-forward capabilities. Windows skips it and continues using Dotter
validation.

Switch only after reviewing the activation diff:

```bash
just nix-switch juan@framearch
```

The same command works with `juan@arch-wsl` or `juan@macbook` on the matching
machine. The recipe invokes the Home Manager app from the flake, so activation
uses the locked input rather than fetching an unpinned GitHub command.

## New-machine bootstrap

Install the Nix daemon using the platform's supported installer. On Arch Linux
or Arch-WSL, the current host uses the distro package:

```bash
sudo pacman -S --needed nix
sudo systemctl enable --now nix-daemon.socket
```

Before the first flake command, enable flakes and copy the age private key from
a secure backup (never from Git):

```bash
mkdir -p ~/.config/nix ~/.config/sops/age
cp nix.conf ~/.config/nix/nix.conf
chmod 700 ~/.config/sops/age
install -m 600 /secure/backup/age-keys.txt ~/.config/sops/age/keys.txt
```

Then run the profile matching the machine: `juan@framearch`,
`juan@arch-wsl`, or `juan@macbook` (Apple Silicon). The secret files are
materialized by sops-nix during activation. On a fresh clone, the equivalent
bootstrap shortcut is:

```bash
INSTALL_NIX_HOME=1 ./bootstrap.sh
```

The shortcut refuses to activate if Nix or the age key is missing; use
`NIX_PROFILE=...` when automatic host detection is not appropriate.

## Host boundaries

- `home/common.nix`: shared user packages and environment.
- `home/framearch.nix`: physical CachyOS desktop, model-storage paths, and
  the laptop model preset.
- `home/arch-wsl.nix`: WSL interop and Windows-mounted paths.
- `home/macbook.nix`: macOS user environment. Homebrew remains authoritative
  for applications during the pilot.

The physical host's CachyOS kernel, AMD/AI drivers, AUR packages, model
the generated model preset, and custom `/opt/cachy-llama` runtime remain
outside Home Manager. Host-specific static presets are now owned by their
matching profiles (`models-laptop.ini` on framearch and `models-macbook.ini`
on macOS).
The residual llama.cpp state—generated model routing and runtime-specific files—
is explicitly Dotter-mapped so this mixed mutable state directory does not block
incremental migration. Root-owned services
and `/etc` configuration require a later NixOS decision, not Home Manager alone.

## NixOS readiness audit

The live router uses a custom binary at `/opt/cachy-llama/bin/llama-server`,
revision `c1627fa4b+26358`, rather than the installed `llama.cpp-vulkan`
package. A related source checkout exists at
`~/projects/ai-inference-bench/CachyLLama` and already contains a `.devops/nix`
package definition with Vulkan support. The flake now pins the matching
`fewtarius/CachyLLama` commit and exposes its derivation as
`legacyPackages.x86_64-linux.cachyLlamaVulkan`.

Build it deliberately, not as part of normal Home Manager activation:

```bash
nix build '.#legacyPackages.x86_64-linux.cachyLlamaVulkan'
```

The package builds and its CPU-side SSD-cache/model-resolution tests pass.
The plain Nix binary cannot see the host RADV device, but a diagnostic
`nixGL` bridge does:

```bash
just nix-test-cachy-vulkan qwen-0.8b
just nix-test-cachy-vulkan qwen-2b 18124
just nix-test-cachy-vulkan qwen-4b 18125
just nix-test-cachy-vulkan lfm-1.2b 18126
just nix-test-cachy-vulkan router-preset 18132 Qwen3.5-0.8B
just nix-test-cachy-vulkan router-preset 18134 Qwen3.5-4B
just nix-test-cachy-vulkan router-preset 18135 LFM2.5-1.2B
```

The smoke test covers the Qwen 0.8B/2B/4B and LFM 1.2B model families
currently used by the router, plus the generated `models.ini` routing path. All
isolated GPU completion tests pass using
environment-based arguments, matching the planned NixOS service contract. It
reports the AMD Vulkan device and performs a real completion without touching
the live service. The nixGL revision is pinned in
`flake.lock` for repeatable diagnostics. It is a
useful Arch pilot, but the wrapper is intentionally not wired into systemd yet;
NixOS graphics packages remain the cleaner long-term solution.

The embedding service can be checked independently:

```bash
just nix-test-cachy-embed
```

The isolated candidate and the current production endpoint both return
768-dimensional embeddings for the same model. The deployed artifact still
needs a binary comparison and inference regression
check before it replaces `/opt/cachy-llama`. The service also depends on
Vulkan/RADV, render-group permissions, a separate `/mnt/ai_models` filesystem,
and model-specific cache paths.

Before an actual NixOS switch, capture the custom build as a pinned Nix
package (or deliberately retain it as an external artifact), then translate
these mutable Arch mechanisms into declarations:

- `/etc/conf.d/llama.cpp` and its shared shell environment;
- the `llama.cpp.service` drop-ins and the port-80 `socat` forwarder;
  the future module runs the forwarder as the configured user with only
  `CAP_NET_BIND_SERVICE`;
- delayed Tailscale readiness for the embedding endpoint; the current Home
  Manager service retries address discovery instead of relying on a no-op
  cross-manager systemd ordering. When NixOS owns the system service, set
  `services.juan.framearchUser.enableMemoryfieldEmbed = false` in the Home
  Manager profile to avoid a port conflict;
- user home-directory layout for service paths (the future module derives
  `/home/<user>` unless overridden);
- the pacman hook that restores llama configuration after upgrades;
- AMD firmware, Vulkan userspace, kernel parameters, and render/video groups;
- model storage mounts and cache-directory ownership.

This must be tested from a separate bootable NixOS installation or rollback
path. Do not replace the running Arch system in place as part of the Home
Manager pilot.

`nixos/framearch-ai.nix` records the intended service contract and is exported
as `nixosModules.framearchAi`, but it is deliberately not activated by the
current Arch host or exposed as a switchable `nixosConfiguration` yet. A future
NixOS host can select the pinned package with
`services.juan.framearchAi.package`; leaving it null preserves the current
external `/opt/cachy-llama` fallback. `nixos/framearch-hardware.nix` separately records the AMD graphics,
render/video/audio groups, and current kernel tuning behind
`services.juan.framearchHardware.enable`; it is also opt-in. It records the
current model filesystem as an additional opt-in mount:
`/dev/disk/by-uuid/fcef66f9-3a98-42ff-83f6-890cb249a22e` (ext4) at
`/mnt/ai_models`, enabled with `services.juan.framearchHardware.enableModelStorage`.
The mount declaration still needs a bootable NixOS rollback test. The Home
Manager embedding service is enabled by default on framearch, but has an
explicit opt-out for the future NixOS system-service handoff. The Dotter
secret hook also recognizes a configured-but-not-yet-materialized sops-nix
symlink, preventing legacy decryption from overwriting the future secret
owner.

### Bootable test checklist

Use a disposable VM or separate bootable disk; do not replace the current Arch
root. In a future NixOS flake configuration, import both exported modules and
pass the pinned package explicitly:

```nix
imports = [
  inputs.self.nixosModules.framearchAi
  inputs.self.nixosModules.framearchHardware
];

services.juan.framearchHardware = {
  enable = true;
  enableModelStorage = true;
};
services.juan.framearchAi = {
  enable = true;
  package = inputs.self.legacyPackages.x86_64-linux.cachyLlamaVulkan;
};
```

Before enabling the system services, set
`services.juan.framearchUser.enableMemoryfieldEmbed = false` in the Home
Manager profile. Then build, inspect, boot, test health/embedding endpoints,
and verify rollback before making the new system the default boot entry. A
disposable VM build and serial-console boot have been verified locally; that
only validates NixOS/systemd assembly, not AMD passthrough, the real model disk,
or the external `/opt/cachy-llama` runtime.

## Migration order

1. Add native Home Manager modules for plain shared user configuration.
2. Split Dotter's blanket `config = "~/.config"` mapping before moving any
   individual paths. This is complete for the first migrated roots.
3. Move remaining application roots one owner at a time.
4. Keep mutable application state (such as htop's rewritten config) in
   Dotter until it has a suitable Home Manager representation. Keep sops-nix
   keys backed up per machine; OAuth state and caches remain
   local.
5. Evaluate NixOS separately for the physical host after the custom AI stack is
   reproducible or deliberately kept external.
