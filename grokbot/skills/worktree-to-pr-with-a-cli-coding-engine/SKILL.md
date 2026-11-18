---
name: Worktree to PR with a CLI coding engine
description: >-
  Use when a coding task on a GitHub repo should be done by a headless CLI
  coding agent on the box (Pi, Codex, or similar) and land as one green pull
  request.
---
# Worktree to PR with a CLI coding engine

One task = one worktree = one branch = one PR.

## Pick the engine
- Use the main CLI engine the user prefers (the one with the bigger usage caps). Use a second CLI engine for an independent review of the diff.
- Fall back to a cloud agent only if the CLI engines are rate-limited or stuck, or if the task needs a long autonomous run.
- Tell the user in one line which engine you picked and why.

## Steps
1. In the writable clone, run `git fetch origin`. Then run `git worktree add <work-dir>/<repo>-wt-<task> -b <engine>/<task> origin/main`.
2. Write the task prompt to a file first, then launch the engine once, headless, in the background (for example `pi -p "$(cat prompt.md)" --provider <p> --model <m>`). Many CLIs print nothing until they exit, so don't relaunch one just because it's silent. Never start it at the same moment you're still writing the prompt file.
3. Ask the engine for tests that prove the old and new behaviour match on fixture data, including edge cases such as duplicate or ambiguous keys.
4. Run the repo's own validation and test suite. Both must pass before you push.
5. Commit with an explicit identity if the worktree has none (`git -c user.name=... -c user.email=...`). Push only the task branch with a plain `git push` (no force), then run `gh pr create`. In the PR body, list in plain words any published output that could change.
6. Wait for CI. Get a read-only second review of the diff from the other engine (for example `codex exec`).
7. Report the PR URL, head SHA, check states, mergeable state, a short diff summary, the review findings, and the output risk.

## Updating a conflicted PR
- Never rebase and force-push. Merge `origin/main` into the PR branch, resolve the conflicts (keep both sides' intent), re-run validation, and do a plain push.
- First confirm the head branch is in the same repo and not a fork.

## Never
- Push to main, force-push, close or delete PRs or branches, or edit a clone that belongs to another bot.
- Put tokens or credentials in prompts, commits, or PR bodies.

## Cleanup
Remove a worktree only once its PR has merged and it holds nothing but ignored files.
