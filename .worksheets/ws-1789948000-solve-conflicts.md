# Solve conflicts — 2026-09-20

## Task
Resolve the active repository merge conflict.

## Human notes
<!-- goals, constraints, feedback, or a requested action -->

## Todos
- [x] Resolve `flake.lock` conflict
- [x] Validate the resolved lockfile and repository state

## Progress
- Started by inspecting the conflict: only `flake.lock` is unmerged, with competing lock entries for `herdr` and `home-manager`.
- Resolved both entries by retaining the updated-upstream pins; staged resolution is clean and no conflict markers remain.
- Full `just ci` was attempted; it stopped in ShellCheck on pre-existing cached generated file `./.cache/paru/build/herdr-bin/herdr.bash` with SC2207 warnings.

## Findings
- Updated upstream entries are newer than the stashed entries for both dependencies.

## Decisions
- Prefer the updated-upstream lock entries unless validation shows they are invalid; lockfiles cannot retain both versions under the same node.

## Questions / Next steps
- Conflict resolution is complete. Full CI remains blocked by the unrelated cached generated shell file; lockfile JSON and `check-nix` should be used as focused validation.
