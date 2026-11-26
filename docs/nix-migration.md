# Nix/Home Manager migration

Home Manager is the authoritative Unix user-environment manager in this
repository. Native Windows configuration is handled by platform scripts.

## Current pilot

`flake.nix` exposes four Home Manager profiles:

```text
juan@framearch   x86_64-linux
juan@arch-wsl    x86_64-linux
juan@macbook     aarch64-darwin
juan@liedelpi    aarch64-linux
```

The pilot manages a shared package baseline, the Brewfile, session variables,
the two framearch user systemd services, Nushell, Starship, Git, the global Git ignore
file, Neovim, Ghostty, the static CI tree, the tracked Zed
keymap, eza, the shared icon helper, the web-search wrapper, the static llama
project files, the Wayland desktop session configs (sway, waybar, wofi, walker,
llamaman, xkb), and the three encrypted secret
destinations through sops-nix. No second configuration manager owns those
Unix paths; each path has one Home Manager owner.

On macOS, Home Manager owns the reproducible CLI baseline, including the 75
portable tools in `home/darwin-packages.nix`. The Brewfile keeps Homebrew for
GUI applications (casks), macOS-integrated/runtime-specific formulae, and
bootstrap prerequisites (`age`, `git`, `sops`): 17 formulae and 35 casks.
Duplicate CLI formulae should not be added back to the Brewfile — not because
Nix shadows them, but because it does not: in an interactive zsh
`/opt/homebrew/bin` precedes `~/.nix-profile/bin`, so a leftover brew copy
silently wins. Bootstrap prepends the activated Nix profile for its remaining
setup steps.

### Build directories that name their tools

A CMake build directory records the tools it was configured with: the `cmake`
that generated it, and the `ninja` it found. Both are absolute paths, and every
regeneration and every `cmake -E` step in it calls those paths, so moving a tool
from Homebrew to Nix does not fail at the tool — it fails inside a build rule
with `no such file or directory`, long after the tool was removed.

`ninja` has to be in the build toolchain list in `home/darwin-packages.nix` for
any of this to work; it is not installed by anything else. After
`home-manager switch`, reconfigure the directory with the Nix `cmake` and a
`ninja` on PATH so the cache names the new ones:

```sh
cd path/to/project && cmake -S . -B build
# a project with presets names its own: Ladybird takes LADYBIRD_SOURCE_DIR=$PWD cmake --preset Release
```

Expect one full rebuild: CMake writes its own path into every command line, and
ninja treats a changed command as a changed target.

Rust is the other half. A project that pins a toolchain in `rust-toolchain.toml`
still resolves `rustc` through PATH, and `~/.nix-profile/bin` now comes before
`~/.cargo/bin`, so the pinned shim loses to Nix's rustc. A rustc newer than the
pin compiles fine until it deprecates something the tree uses, which the project
compiles with `-Dwarnings`: the error then names a crate nobody touched. Either
put `~/.cargo/bin` first for that build, or hand the project the pinned compiler
(Ladybird takes `-DRUST_RUSTC="$(rustup which rustc)"`).

### Which GUI applications Nix can own

Nix is not limited to CLIs: `iina` and `localsend` are in
`home/darwin-packages.nix` and macOS launches them from the store. Home Manager
needs no `home.file` entry for this — it links every `.app` in `home.packages`
into `~/Applications/Home Manager Apps`, which is what registers the bundle
with LaunchServices. A second link elsewhere registers the same app twice.

Four shapes stay on Homebrew, each for a reason that no Nix feature removes:
`pkg`/`installer` casks that write to `/Library`, install launch daemons or
register system extensions the user must approve (`macfuse`, `displaylink`,
`tailscale-app`, `beid-token`, `logi-options+`, `microsoft-office`); App Store
apps, whose receipts only `mas` can produce; self-updating apps, whose updater
cannot write into a read-only store and whose version churns weekly
(`google-chrome`, `discord`, `vscode`, `obsidian`, `zed`); and apps nixpkgs
tracks too slowly to be worth it (`itsycal` ships 0.15.12 against Homebrew's
0.29.0). Patching or re-signing a bundle also changes its code identity, which
resets the Accessibility and Screen Recording grants macOS keys to it, so a
moved app must be one nixpkgs does not have to modify.

Validate from a machine with Nix installed:

```bash
nix flake check --all-systems
just nix-check juan@framearch
```

`just ci` also runs the flake check when Nix is installed; this includes an
inert enabled-module evaluation for graphics, model storage, service users, and
port-forward capabilities. Windows uses PowerShell deployment scripts and
continues with the platform-independent checks.

Switch only after reviewing the activation diff:

```bash
just nix-switch juan@framearch
```

The same command works with `juan@arch-wsl`, `juan@macbook`, or `juan@liedelpi`
on the matching machine. The recipe invokes the Home Manager app from the flake,
so activation uses the locked input rather than fetching an unpinned GitHub
command.

## New-machine bootstrap

Install the Nix daemon using the platform's supported installer. On Arch Linux
or Arch-WSL, the current host uses the distro package:

```bash
sudo pacman -S --needed nix
sudo systemctl enable --now nix-daemon.socket
```

On Debian (liedelpi), the official multi-user installer is used instead:

```bash
sh <(curl -L https://nixos.org/nix/install) --daemon
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
`juan@arch-wsl`, `juan@macbook` (Apple Silicon), or `juan@liedelpi`
(aarch64 Linux). The secret files are
materialized by sops-nix during activation. On a fresh clone, `bootstrap.sh`
installs Nix and activates the matching profile automatically:

```bash
./bootstrap.sh
```

Use `SKIP_NIX_HOME=1` only when deliberately keeping Home Manager inactive, and
`NIX_PROFILE=...` when automatic host detection is not appropriate.

## Taking over an existing machine

Machines previously deployed by the retired manager (arch-wsl, macbook, and
Windows) can move directly to the current owner for their platform. On Unix,
activate the matching profile; Home Manager backs up conflicting paths when
requested:

```bash
just nix-switch juan@arch-wsl   # or juan@macbook / juan@framearch / juan@liedelpi
```

On Windows, run `powershell -ExecutionPolicy Bypass -File
scripts\deploy-windows.ps1`. Existing regular files are preserved with a
`.dotfiles-backup-<timestamp>` suffix before links are created.

## Host boundaries

- `home/common.nix`: shared user packages and environment.
- `home/linux-desktop.nix`: Linux desktop configs (sway, waybar, wofi, walker,
  llamaman, xkb) imported by both Linux profiles.
- `home/framearch.nix`: physical CachyOS desktop, model-storage paths, and
  the laptop model preset.
- `home/arch-wsl.nix`: WSL interop and Windows-mounted paths.
- `home/macbook.nix`: macOS user environment. Homebrew remains authoritative
  for applications and the macOS-integrated formulae; see below.
- `home/darwin-packages.nix`: the macOS CLI toolchain Nix owns, in commented
  groups. Its header records the nine tools deliberately left on Homebrew and
  the shims that disappeared with the brew copies, so a later "cleanup" does
  not delete the bootstrap path or re-add a duplicate.

The physical host's CachyOS kernel, AMD/AI drivers, AUR packages, model
the generated model preset, and custom `/opt/cachy-llama` runtime remain
outside Home Manager. Host-specific static presets are now owned by their
matching profiles (`models-laptop.ini` on framearch and `models-macbook.ini`
on macOS).
The model router is rendered by a Home Manager activation script, while
runtime-specific files remain outside Home Manager. Root-owned services
and `/etc` configuration require a later NixOS decision, not Home Manager alone.

## NixOS readiness audit

The live router uses `/opt/cachy-llama/bin/llama-server`, revision
`c1627fa4b+26358`. The source is Juan's fork at
`github:huaxel/CachyLLama`; the flake pins the matching `c1627fa4b8526fe146bccb3ca228f3dd0838517c` commit and exposes its Vulkan package as
`legacyPackages.x86_64-linux.cachyLlamaVulkan`.

Build and smoke-test it deliberately, not as part of normal Home Manager
activation:

```bash
nix build '.#legacyPackages.x86_64-linux.cachyLlamaVulkan'
just nix-test-cachy-vulkan qwen-0.8b
```

The smoke test uses a nixGL bridge to expose the host RADV device and does not
touch the live service. The embedding smoke test can be run independently
with `just nix-test-cachy-embed`. NixOS still depends on Vulkan/RADV,
render-group permissions, a separate `/mnt/ai_models` filesystem, and
model-specific cache paths.

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

The intended service contract, disposable host definition, and hardware/kernel
tuning now live on the `nixos-framearch-future` branch (`nixos/framearch-ai.nix`
exported as `nixosModules.framearchAi`, `nixos/framearch.nix` exposing
`nixosConfigurations.framearch`, `nixos/framearch-hardware.nix` with the AMD
graphics, render/video/audio groups, kernel tuning, and the opt-in model-storage
mount `/dev/disk/by-uuid/fcef66f9-3a98-42ff-83f6-890cb249a22e` at `/mnt/ai_models`).
The host selects the pinned package with `services.juan.framearchAi.package`;
leaving that option null preserves the external `/opt/cachy-llama` fallback.
The mount declaration still needs a bootable NixOS rollback test. The Home
Manager embedding service is enabled by default on framearch, but has an
explicit opt-out for the future NixOS system-service handoff. The standalone
secret fallback is used only when sops-nix is not active, preventing duplicate
secret writers from overwriting the managed destinations.

### Bootable test checklist

Use a disposable VM or separate bootable disk; do not replace the current Arch
root. Check out the `nixos-framearch-future` branch first — main no longer
evaluates the host. Then evaluate and build its system or VM artifact deliberately:

```bash
git checkout nixos-framearch-future
nix eval '.#nixosConfigurations.framearch.config.system.build.toplevel.drvPath'
nix build '.#nixosConfigurations.framearch.config.system.build.toplevel'
# For a disposable VM, build and run the generated result/\"bin/run-*-vm\".
nix build '.#nixosConfigurations.framearch.config.system.build.vm'
```

On the branch, for a custom future host, import both exported modules and pass the pinned package explicitly:

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
and verify rollback before making the new system the default boot entry.

A disposable VM has validated the service layer with the pinned package
enabled: all three units install, the router and embedding services run as
`juan` (not root) with the render/video/audio groups, `ExecStart` resolves to
the store-path `llama-server` and actually executes (restart loop on the
absent model preset, as expected without the real disk), the environment
carries `LLAMA_ARG_MODELS_PRESET`, the socat forwarder binds port 80 as a
non-root user via `CAP_NET_BIND_SERVICE`, the embedding wrapper exhausts its
Tailscale retry loop and fails closed, and the `nofail` model mount does not
block boot when the disk is absent. Still untested: real AMD Vulkan
passthrough, the physical `/mnt/ai_models` disk, real inference, and the
external `/opt/cachy-llama` fallback.

## Ownership rules

1. Keep shared Unix user configuration in Home Manager modules.
2. Render machine-specific model routing during Home Manager activation.
3. Keep mutable application state, OAuth state, and caches local to each machine.
4. Use `scripts/deploy-windows.ps1` for native Windows application paths.
5. Evaluate NixOS separately for the physical host after the custom AI stack is
   reproducible or deliberately kept external.
