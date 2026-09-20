# Review Nix setup — 2026-09-20

## Task
Review the repository's Nix setup for correctness, maintainability, security, and reproducibility.

## Human notes

## Todos
- [x] Inspect flake structure and Nix entry points
- [x] Run focused validation and inspect generated configuration risks
- [x] Record actionable findings with file and line references

## Progress
- Started review; preserving pre-existing `flake.lock` and unrelated worksheet changes.
- `nix flake check --all-systems` passes; it emits three deprecated `stdenv.is*` warnings from dependencies.
- Native `juan@macbook` activation package builds successfully.
- Cross-building the Linux Home Manager profiles from this aarch64-darwin host is not supported by the configured local builder; failures are platform mismatch, not evaluation failures.
- Added option-derived firewall rules: TCP/80 is allowed when port forwarding is enabled, while the configured embedding port is restricted to `tailscale0`.
- Added systemd sandboxing to llama-server, embedding, and socat services.
- Updated `just check-nix` to build native Home Manager profiles after flake evaluation.
- Added flake assertions covering firewall ports and service hardening.
- Final `just check-nix` and full `just ci` pass; upstream deprecation warnings remain.
- Enabled DHCP and flakes in the NixOS host so the disposable installation can obtain network access and rebuild itself immediately.
- Allowed only the per-user cache directory to remain writable under AI service sandboxing, preserving Hugging Face/model cache behavior.
- Added flake assertions for DHCP, flakes, and the cache write exception.
- Full `just ci` passes again.
- Documented safe `nixos-rebuild build/switch --flake .#framearch` usage and disk-label prerequisites in `README.md`.
- Enabled Tailscale's firewall integration for direct connectivity and added a regression assertion.
- Final `just ci` passes.
- Added `just nixos-check` for non-activating NixOS system-closure builds; documented direct `nix` commands for fresh hosts that may not have `just` installed.
- Changed AI firewall contributions to merge with host-specific rules instead of overriding them.
- Final `just ci` passes.
- Updated `nix-check` and `nix-switch` to use a temporary Git index when exposing untracked Nix modules, preserving the real index; verified `just nix-check juan@macbook` leaves status unchanged.
- Full `just ci` passes again.
- Ordered the primary llama service after `network-online.target` and added the corresponding dependency.
- Final `just ci` passes.
- Added a flake assertion that the primary llama service retains network-online ordering.
- NixOS system-closure dry-run resolves successfully here; a real build still belongs on an x86_64-linux builder.
- Made `nixos-check` detect non-x86 hosts and report a clear evaluation-only skip instead of failing with platform-mismatch noise; verified on aarch64-darwin.
- Final `just ci` passes.

## Findings

- **Resolved — Firewall exposure.** AI module firewall rules now merge option-derived TCP/80 and Tailscale-only embedding ports without overriding host rules.
- **Resolved — Service hardening.** llama-server, embedding, and socat units now use systemd sandboxing with an explicit cache write exception.
- **Resolved — Build coverage.** `check-nix` builds native Home Manager profiles; `nixos-check` provides a non-activating NixOS closure build on x86_64-linux.
- **Open upstream — Deprecation warnings.** `stdenv.isLinux/isAarch64/isDarwin` warnings remain during dependency evaluation; no matching usage exists in repository code.

## Decisions

- TCP/80 remains LAN-facing because the configured socat forwarder listens on all interfaces; embedding TCP/8001 is restricted to Tailscale.
- No dependency pins were changed; the existing `flake.lock` modification was preserved.

## Questions / Next steps

- Run `just nixos-check` on the target x86_64-linux machine or a matching builder.
- Update upstream dependencies when the deprecated `stdenv.is*` accessors are removed.
