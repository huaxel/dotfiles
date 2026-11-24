---
name: branch-and-release
description: Audit open branches, worktrees, and release state, then merge, tag, or publish safely. Use explicitly for "review and merge the open branches", branch or worktree cleanup, conflict resolution across branches, version bumps, changelogs, tags, or npm publishing. Never rewrites shared history, never force-pushes, and confirms a push landed by querying the remote.
license: MIT
disable-model-invocation: true
---

# Branch and Release

Git work is where an otherwise correct change quietly loses data. Establish state before any write, and confirm each mutation from the remote rather than from exit codes.

## Read the state

Before deciding anything, gather: current branch and its upstream tracking, `git status --porcelain` including untracked files, `git worktree list`, `git branch -vv`, branches with no upstream, branches already merged into the default branch, and any stash entries. Confirm the repository's default branch instead of assuming `main`.

Treat state you did not create as someone else's: other worktrees, other agents' branches, and uncommitted changes you cannot explain. Report them. Do not delete, reset, or clean them without explicit authorization for that specific action.

## Judge each branch

For every candidate branch, state what it does, whether its intent is already on the default branch, whether it is behind or diverged, and whether its tests pass on its own commit. Use content comparison (`git log base..branch`, `git diff base...branch`, `git cherry`), not commit titles alone.

Classify each branch as: merge, rebase, supersede, keep open with a reason, or retire with a reason. An intent that already landed under a different commit is superseded, not conflicted.

## Merge and resolve

Merge with intent. Preserve the semantics of both sides; a textual merge that resolves to code neither side intended is a bug. When both sides change the same contract in incompatible ways, stop and ask rather than inventing a third behavior.

Stage explicit paths. Never `git add -A` or `git commit -a` in a worktree shared with other work: unrelated files and runtime artifacts (transcripts, caches, credentials) get swept in. Review `git diff --cached` before committing.

Run the project gate (`just ci` where provided) on the merged result, not on either side alone. A green check on a parent commit is not evidence about the merge.

## Release

Confirm the artifact identity before publishing: package name, version, files included, and that the version does not already exist upstream. Bump the version, update the changelog or release notes in the same commit as the bump, and tag the exact commit that the publish will build from.

Follow the repository's documented release path rather than inventing one, including any manual workflow dispatch or post-publish verification script. Publishing is irreversible in practice; treat it as an action requiring explicit authorization for that version.

## Verify, do not assume

- A push is done when `git ls-remote <remote> <ref>` returns the new sha. A zero exit code is not evidence: long pre-push hooks can be dropped by the remote while the command still returns.
- A merge is done when the intended commit is an ancestor of the target branch.
- A release is done when the registry, tag, and release notes agree on the same version.

Report the branches touched, the shas landed, checks actually run, anything deliberately left open with its reason, and any operation you were not authorized to perform.
