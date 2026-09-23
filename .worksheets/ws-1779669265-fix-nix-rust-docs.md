# Fix Nix Rust docs build — 2026-05-24

## Task
Investigate the reported `nix-check` failure while building Rust 1.96.1 and Herdr 0.9.1.

## Human notes
The visible error shows `rust-docs-1.96.1.drv` failed, cascading through `rust-default`, `herdr`, activation, and Home Manager.

## Todos
- [x] Inspect repository instructions and relevant Nix configuration
- [x] Retrieve the underlying rust-docs build failure
- [x] Implement a minimal fix if the cause is in this repository
- [x] Run the narrowest validation and report remaining blockers

## Progress
- Started investigation from dependency-chain output.
- Retrieved the underlying `rust-docs` log and confirmed the archive was corrupt, not a Rust source/build error.
- Repaired the corrupt `rust-docs` archive with `sudo nix-store --repair-path`.
- Retried `just nix-check`; it exposed and then repaired a second corrupt `rust-std` archive.
- Retried again; Rust/Herdr now pass, but profile build reaches `sops-install-secrets` and fails in `gcc: internal compiler error: Segmentation fault`.
- Verified and repaired a corrupt GCC store path and a corrupt `ratatui-termwiz` crate archive.
- Final `just nix-check` passes: flake checks pass and `juan@framearch` activation package builds.

## Findings
- The original Rust failure was local Nix-store corruption: the archive was all zero bytes, while the upstream URL currently serves valid XZ data.
- The second Rust standard-library archive was also corrupt, indicating a broader interrupted/failed download episode rather than a repository configuration defect.
- The intermediate compiler crash was caused by a corrupt GCC store path; repairing GCC resolved it.
- `nix flake check --all-systems` passes, and the complete Home Manager activation build passes.

## Decisions
- Do not change repository Nix configuration: the original issue was repaired in the local store and no source change is indicated.

## Questions / Next steps
- No further action required for this failure. The repair was local to the Nix store; repository source files were unchanged.
