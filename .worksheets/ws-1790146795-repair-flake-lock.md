# Repair malformed flake lock — 2026-09-23

## Task
Restore a valid flake.lock so nix flake update can run.

## Human notes
<!-- User reported nix flake update failing because flake.lock contains conflict markers. -->

## Todos
- [x] Resolve the lockfile conflict
- [x] Validate JSON and Nix flake metadata
- [x] Commit (authorized 2026-09-23 as f43809c)
- [x] Push to remote (authorized 2026-09-23; 6b04419..f43809c)

## Progress
- Started investigation; conflict markers found in the herdr input.
- Resolved the herdr stash conflict keeping HEAD (8ac9542, 2026-09-21); JSON + `nix flake metadata` pass.
- Ran `nix flake update`: herdr, home-manager, and nixpkgs inputs updated; exit 0.
- `just check-nix` passes (flake check + HM builds). Full `just ci` is blocked by a pre-existing shellcheck SC2016 in bootstrap.sh:73,75 — unrelated file, untouched by this repair.
- 2026-09-23 follow-up: the SC2016 was a false positive (single quotes must defer $(...) expansion to git filter time). Added `# shellcheck disable=SC2016` per repo convention; full `just ci` now passes 🟢.
- 2026-09-23: Resolved the interrupted rebase conflict in `flake.lock` by retaining the repaired/up-to-date lockfile from the current side; rebase completed and `main` is ahead of `origin/main` by two commits.
- `flake.lock` has no conflict markers, passes JSON validation, and `git diff --check` is clean.
- `just ci` reached the home-server checks but failed on the existing `tmp_worktree: unbound variable` in `scripts/home-server-deploy/post-receive:570`; all earlier checks passed.

## Findings

## Decisions

## Questions / Next steps
