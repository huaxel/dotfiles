# Review branches — 2026-09-20

## Task
Review the repository branches against `main`.

## Human notes

## Todos
- [x] Compare branch histories and changed files
- [x] Inspect branch diffs for correctness and risks
- [x] Report actionable findings and verification gaps

## Progress
- Started review; working tree has an unrelated modification in `flake.lock`.
- Created `integrate-pi-safety` from current `main`; excluded the footer branch because the footer now lives in a separate repository.
- Activated the existing Pi safety extensions in `pi/agent/settings.json`.
- Tightened Git interception to avoid embedded-text false positives and block `git commit -n`; added regression coverage.
- `just ci` passed completely.
- Focused extension tests also pass with the repository-local Pi runtime: 5 Git-interceptor tests and 6 continuation tests.
- Refined Git matching to accept leading whitespace; focused tests and `just check-ts` pass again.
- Review-only pass confirms no session deletion/pruning changes. The only unrelated worktree change is the pre-existing `flake.lock`; no commit or push was performed.
- Reviewed the four dependency pin updates in `flake.lock`; JSON parsing, `nix flake metadata`, and full `just ci` all pass. No correctness or security findings.
- Added coverage for `git -C repo commit -n`; focused Git tests and `just check-ts` pass.
- With explicit approval, committed only the three safety files as `48dbf90`; hook-generated environment secret changes were excluded. `flake.lock` and this worksheet remain uncommitted.
- With explicit approval, pushed `integrate-pi-safety` to `origin`; GitHub offered PR URL: https://github.com/huaxel/dotfiles/pull/new/integrate-pi-safety
- Created PR #23. Added and pushed `c56f230` to cover policy text false positives; generated secret churn was excluded again.
- PR #23 was squash-merged into `main` as `1a6c117`; local `main` was fast-forwarded to match `origin/main` while preserving the unrelated `flake.lock` and worksheet changes.

## Findings

## Decisions

- Do not delete, archive, or prune Pi sessions. The health-check storage findings are informational only.
## Questions / Next steps

- Do not merge either branch directly; recover only selected commits onto current `main` after separate review.

- Branch inventory: `footer-extension` is 784 commits behind and 300 ahead of `main`; `secret-cleanup-rewrite` is 50 behind and 16 ahead.
- Both branches are stale snapshots rather than small merge-ready branches.
- `secret-cleanup-rewrite` contains tracked `.pi-subagents/artifacts/*` generated review transcripts and deletes the tracked worksheet/document history.

- `footer-extension` adds a tracked 91-byte `npmrc` blob absent from `main`; this conflicts with the repository credential rule and should be treated as a possible credential exposure until inspected/rotated by the owner.
- `secret-cleanup-rewrite` does not register its new `continue-after-compaction` or `git-interceptor` extensions (`settings.json` has `extensions: []`), so the implementation is inert as checked in.
- `git-interceptor` also uses raw regexes: it matches `git` in arbitrary shell text and misses equivalent bypass forms such as `git commit -n`; its tests cover only the happy path.
