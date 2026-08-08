---
name: requesting-code-review
description: Use before merging or after a major feature, complex fix, or non-trivial refactor to obtain an independent review.
---

# Requesting Code Review

Use an independent reviewer when the cost of a missed defect is meaningful.
For a tiny, isolated change, a focused self-review plus verification may be
sufficient unless project policy requires review.

## Required context

Give the reviewer only material it can actually read:

- changed file paths and relevant line ranges
- concise change summary
- requirements or acceptance criteria
- tests and checks already run
- known limitations or pre-existing failures
- optional path to a saved patch/diff artifact

Commit SHAs are useful metadata, but they are not sufficient context: the
configured reviewer has read-only file tools and no shell/Git access.

Use the project's configured `reviewer` agent/workflow and its dispatch
contract.

## Dispatch and review

1. Prepare the changed-file list (and a readable patch if the diff is useful).
2. Dispatch the `reviewer` agent with those paths and the requirements.
3. Fix Critical and Important findings before proceeding.
4. Re-check affected behavior after each fix.
5. Record Minor findings for later or explain why they are intentionally deferred.
6. If feedback is wrong, respond with concrete code, test, or requirement
   evidence rather than ignoring it.

## Final gate

A review is not verification. Inspect the final diff and run the relevant
project checks independently before reporting completion or merging.
