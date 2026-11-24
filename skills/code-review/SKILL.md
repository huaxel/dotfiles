---
name: code-review
description: Review a change, branch, or repository and report what is actually wrong. Use when asked to "review the current state", "review my repo", "look over this diff", "sanity check", or to record a verdict on a branch before merging. Read-only by default; findings cite file and line, separate confirmed defects from nits, and never claim runtime behavior without running it.
license: MIT
---

# Code Review

Find what will break, not what could be nicer. A review is a set of evidence-backed findings, not a rewrite and not a list of imagined failures.

## Establish the review surface

Determine what is under review: an uncommitted diff, a branch against its base, a range of branches, or the whole repository. Inspect the working tree first. Parallel agents may share it, so unexpected changes are context, not something to revert or attribute to yourself.

Read the project's own instructions, gate (for example `just ci`), and conventions before judging style. A rule the repository enforces through a check outranks a preference.

For a repository-wide review with no diff, prioritize the paths that carry risk and the ones closest to the user's stated goal. Say what you sampled and what you skipped; do not imply full coverage.

## Read for invariants, not adjectives

Track the facts the code's correctness depends on: ownership and lifetime, ordering and idempotency, error and partial-failure paths, serialized contracts and wire formats, persistence schemas, integer and time domains, security boundaries and input trust, and version-pinned dependency behavior. State a doubtful fact as a falsifiable claim.

Follow the change past its diff: callers, configuration, generated code, migrations, feature flags, caches, and other-language consumers. A search with no matches narrows uncertainty; it does not prove absence.

## Separate evidence grades

Label each finding by the evidence actually obtained:

- **Confirmed defect**: a reproduction, a failing test, or a trace through existing code that must fail.
- **Likely defect**: strong static reasoning with a stated assumption that was not exercised.
- **Risk**: a real hazard whose trigger is unknown or out of scope.
- **Nit**: readability or convention only.

Do not promote a hunch to a defect because the code looks unusual, and do not demote a defect to a nit because fixing it is awkward. Nothing observed at runtime means runtime behavior stays unverified.

## Report

Lead with the verdict: mergeable, mergeable with fixes, or blocked. Then list findings ordered by consequence, each with the file, the line or region, the failure mode, and the smallest fix or check that would settle it.

Record explicitly: findings dismissed after investigation and why, checks actually run with their result, and gaps you could not cover (unavailable environment, missing credential, untestable path).

Do not apply fixes, commit, push, or open a pull request unless asked. When the request also includes merging, branch cleanup, or a release, hand off to `branch-and-release` rather than improvising git operations inside the review.
