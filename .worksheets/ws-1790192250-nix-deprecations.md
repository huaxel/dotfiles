# Fix Nix deprecations

## Task
Remove deprecated platform accessor warnings without upgrading pinned sources.

## Human notes

## Todos
- [x] Fix pinned packaging and verify checks

## Progress
- Traced first warning to CachyLLama flake; package also uses deprecated accessors.

## Decisions
- Preserve CachyLLama, Herdr, and nixpkgs pins and build behavior; update only Herdr’s nested rust-overlay input for its upstream platform-accessor fix.

## Findings
- Vendored `nixos/cachy-llama-package.nix` from the pinned source, changing only source-root injection and platform accessors. `flake.nix` bypasses the deprecated upstream flake outputs.
- CachyLLama Vulkan derivation path matches baseline exactly; no binary rebuild required.
- Rust overlay library diff consists only of three `stdenv.hostPlatform` replacements in `mk-aggregated.nix`.
- `NIX_ABORT_ON_WARN=1 just nix-check juan@framearch` passes.
- `NIX_ABORT_ON_WARN=1 just check-nix` passes, including both native Linux Home Manager builds.
- `just ci` fails in an unrelated existing home-server deployment test: `scripts/home-server-deploy/post-receive:570`, `tmp_worktree: unbound variable`. Remaining gate recipes were run separately and pass; PowerShell AST checking skipped because pwsh is unavailable.
- Independent read-only Gemini review found no important correctness issues. Maintenance caveat: keep the vendored expression synchronized when updating the CachyLLama pin.
- New expression marked intent-to-add so Nix 2.35 can see it; temporary-index recipe did not expose it. No commits or activation performed.

## Questions / Next steps

## Progress — CI cleanup follow-up
- Fixed deployment EXIT cleanup by keeping trap-referenced state script-scoped; main stays in the original shell so hook-PID signals work.
- Rejected initial subshell approach after independent review identified orphaned deployments on parent-PID termination.
- Added regression coverage for original failure status, checkout cleanup, rollback, and TERM delivered to the original hook PID.
- `just check-home-server` and final `just ci` pass. However, final CI again emits Rust-overlay deprecation warnings; `flake.lock` is no longer modified in the worktree, indicating the earlier overlay update is no longer present. Do not overwrite concurrent user Git changes.
- Removed the new Nix file's intent-to-add entry after it blocked Git autostash. The file is preserved and now untracked; ordinary autostash does not include it. Nix Git-flake evaluation needs it tracked again before validation.
