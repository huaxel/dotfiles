---
name: PR merge checklist
description: >-
  Use before squash-merging a GitHub pull request on the user's behalf, to
  decide whether you may merge it yourself or need the user's yes.
---
# PR merge checklist

## Check the live state yourself
Run `gh pr view <n> --json state,mergeable,mergeStateStatus,headRefOid,statusCheckRollup`. Don't rely on an engine's report alone.

## You may merge without asking only if ALL of these hold
1. You launched the PR, or the user handed it to you by name.
2. `state` is OPEN, `mergeable` is MERGEABLE, and `mergeStateStatus` is CLEAN.
3. Every required check (validation gates, secret scanning, etc.) is green on the current head SHA.
4. The PR body lists no unresolved changes to published numbers or outputs, and no output depends on data you couldn't test.

If any of these fails, hold the PR and ask the user. Lay out the risks in plain words, then send a short widget offering merge or hold.

## Merge
`gh pr merge <n> --squash --match-head-commit <headRefOid>`. Then re-read the PR to get the merge commit.

## Report
One line: the PR link, `merged as <short sha>`, plus anything the user must re-check before republishing (stats, charts, posts).

## Never
Force-push, push to main, close or delete PRs or branches, or merge in another repo.
