# Fix nix-switch plugin activation — 2026-09-22

## Task
Diagnose the failed `nix-switch juan@arch-wsl` activation, especially the Herdr plugin checkout failure and resulting nonzero recipe.

## Human notes

## Todos
- [x] Inspect repository state and Herdr plugin activation configuration
- [x] Identify a safe fix that preserves unrelated local changes
- [x] Validate the fix or document the remaining manual action

## Progress
- Started analysis from supplied activation log.
- Confirmed the repository's plugin pins and activation script were correct; the failure was in per-user Herdr plugin state.
- Reinstalled `jhochenbaum.hunkdiff` at its pinned commit and reinstalled the drifted `herdr-file-viewer` at its declared pinned commit.
- Re-ran the plugin setup script: all three plugins are pinned and present.
- Re-ran `just nix-switch juan@arch-wsl`: completed successfully through Home Manager activation.

## Findings
- The first failure was a dirty/incomplete Herdr hunkdiff checkout during plugin installation, not a Nix evaluation failure.
- `herdr-file-viewer` was installed at `1d4a790e9cb8`, while the dotfiles pin is `647f03236d9a`; this independently made the activation hook fail.
- The deprecation warnings, `htop` directory comparison message, and 400 Home Manager news items did not prevent the successful switch.
- Existing unrelated local repository changes remain untouched (`flake.lock` plus pre-existing worksheets).

## Decisions
- Repair per-user plugin state rather than changing repository pins or weakening the activation hook's integrity check.

## Questions / Next steps
- The later `mise` SIGSEGV was caused by a modified/corrupted Nix store path: `mise-2026.8.6` failed Nix content verification while the Arch `/usr/bin/mise` worked.
- Repaired the mise store path from `cache.nixos.org`; `mise --version` and `mise hook-env -s nu` now work.
- Nix verification also reports a separately modified Python 3.14 store path; it was not needed for the mise repair and remains unrepaired.

## Questions / Next steps
- No further action required for the mise error; repair the separately corrupted Python path if its tools fail.
