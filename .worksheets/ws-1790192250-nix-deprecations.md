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

## Progress — 2026-10-08 continuation ("go on")
- Found a stash-pop conflict in `pi/agent/howaboua-pi-stuff-changelog.json` (upstream 0.2.15 vs stashed 0.2.14, base 0.2.13) blocking two leftover autostash entries. Resolved to 0.2.15 (newest) and staged; left both stashes in place. `pi/agent/settings.json` worktree flag is stat-dirty only (hash matches index); user's settings/model changes live in stash@{1}, untouched.
- Diagnosed the remaining `stdenv.isLinux` deprecation (via HM herdr module → `lib.getExe herdrPackage` → rust-overlay `lib/mk-aggregated.nix:76,85,97`). Upstream fix is oxalica/rust-overlay 892c035 (2026-08-13, "treewide: stdenv.is* -> stdenv.hostPlatform.is*"); 37 commits between lock and fix are manifest-only data updates. Pinned the hoisted `rust-overlay` lock node to 892c035 (rev/lastModified/narHash transplant; `nix flake update rust-overlay` can't address it since flake.nix doesn't declare the input directly). User's concurrent herdr bump (1b23719 → 4dc23bb) preserved — lock diff is exactly those two hunks.
- `NIX_ABORT_ON_WARN=1 nix flake check --all-systems` passes; both native HM profiles (`juan@framearch`, `juan@arch-wsl`) build warning-free; full `just ci` passes 🟢.
- Still open: decide with human whether to restore stash@{1} (settings model swap + install-and-patch typebox fix) and drop the superseded stash@{0}; nothing committed.

## Progress — 2026-10-08 stash restoration ("go on")
- `git stash apply stash@{1}` initially refused on a phantom stat-dirty flag, then conflicted for real: HEAD has restructured settings.json since the stash base (object-format packages, capacity.ts, subagent path, extra model), so a wholesale apply would have regressed committed work. HEAD already contains the stash's model rename.
- Hit an environment hazard: the worktree settings.json was found truncated to 0 bytes mid-operation (clean filter fails on empty input, so diff/add broke until recovery). Smudge/clean filters test fine on valid content; cause undetermined — possibly a concurrent Pi settings rewrite. All three conflict stages survived in the index, so no data was lost.
- Resolved as: HEAD content + the one genuinely new stash item (`git:github.com/aliceisjustplaying/pi-you-should-know` appended to packages); install-and-patch.sh typebox fix applied cleanly from the stash. Both autostash entries dropped after verifying staged diffs; `git stash list` is empty.
- `just ci` passes 🟢 on the final tree. Still nothing committed — staged: changelog 0.2.15 resolution, settings.json (+1 MCP line), install-and-patch.sh (typebox cleanup); unstaged: flake.lock (herdr bump + rust-overlay fix), this worksheet.
