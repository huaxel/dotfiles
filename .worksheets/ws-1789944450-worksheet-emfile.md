# Worksheet watcher EMFILE — 2026-09-20

## Task
Explain the worksheet-loop extension `EMFILE: too many open files, watch` error during `/reload`.

## Human notes
<!-- goals, constraints, feedback, or a requested action -->

## Todos
- [x] Identify whether the failure is the process fd limit or inotify exhaustion
- [x] Inspect worksheet watcher reload cleanup
- [x] Disable runaway Git fsmonitor and add watcher error handling

## Progress
- Confirmed the failure occurs at the directory `fs.watch()` call during `session_start` on reload.
- Measured host inotify usage: 1,019 of 1,024 max user inotify instances; 204,552 watches of 524,288.
- Disabled Git fsmonitor declaratively in `gitconfig` and `home/common.nix`, activated Home Manager, and stopped orphaned daemons.
- Added a graceful warning path around the worksheet directory watcher.
- Focused worksheet tests, Deno checking, and `just ci` all pass.

## Findings
- Shell `ulimit -n` is 2,097,152, so the ordinary per-process open-file limit is not the constraint.
- Linux reports inotify exhaustion as Node `EMFILE` from `fs.watch()`.
- The host has hundreds of `git fsmonitor--daemon` processes, generally one inotify instance each, consuming nearly all 1,024 instances.
- `worksheet-loop.ts` already calls `closeWatcher()` before installing a replacement watcher on reload, and closes directory/file watchers on shutdown. The immediate cause is system-wide inotify instance pressure, not the target worksheet directory or its number of files.

## Decisions
- Treat this as an environment/resource exhaustion issue first; no worksheet watcher leak was found.
- Add defensive watcher error handling anyway so future resource exhaustion produces a warning instead of an extension error.

## Questions / Next steps
- Restart or reload Pi so the updated extension is loaded; worksheet watching should then work normally.
- Git fsmonitor is intentionally disabled because it was spawning hundreds of orphaned daemons; re-enable only after fixing that host-level behavior.
