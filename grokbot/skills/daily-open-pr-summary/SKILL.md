---
name: Daily open-PR summary
description: >-
  Use when a routine or the user asks for a daily status of a GitHub repo's open
  pull requests and recent merges.
---
# Daily open-PR summary

1. Run `gh pr list --state open --json number,title,url,isDraft,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,author`.
2. For each open PR, note its CI state, whether it's mergeable or conflicting, whether it's a draft, and what it's waiting on (the user, CI, an agent, or outside data). Read the body for any published numbers or outputs it would change. Also note which PRs are redundant with or stacked on others.
3. List the PRs merged since the last summary (or the last 24h on a first run), with their merge commits and merge times in the user's time zone. Leave out anything an earlier summary already covered.
4. Flag in bold, in plain words, any merge or open PR that changes numbers the user publishes, and what to re-check before posting.
5. Send one short message: open PRs first, then the merges. Use linked PR titles and short SHAs.
6. If there are no open PRs and nothing merged, send nothing.
7. Don't merge, close, or rebase anything from the summary. Offer those as choices for the user.
