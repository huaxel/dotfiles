---
name: using-git-worktrees
description: Create an isolated git worktree when feature work needs a separate checkout.
disable-model-invocation: true
---

# Using Git Worktrees

Use this skill only when isolation is useful or the user asks for a worktree.
Announce that an isolated workspace is being prepared.

## 1. Choose a location

Use the first applicable option:

1. Existing `.worktrees/`
2. Existing `worktrees/`
3. A directory named by `CLAUDE.md` or project guidance
4. Ask the user; do not silently choose a new convention

For a project-local location, verify the chosen directory is ignored before creating anything:

```bash
git check-ignore -q <worktree-directory>
```

If it is not ignored, explain the risk and ask before changing `.gitignore`.
A global location outside the repository needs no ignore rule.

## 2. Create and enter it

```bash
git worktree add <path>/<branch> -b <branch>
cd <path>/<branch>
```

Use the repository’s documented setup command. If no guidance exists, inspect
project files and package scripts before installing dependencies; do not run an
arbitrary package manager command by pattern alone.

## 3. Establish a baseline

Run the project’s focused or standard test command in the new worktree. Report
pre-existing failures before implementation and ask whether to continue.

Then report:

- absolute worktree path
- branch name
- setup command, if any
- baseline command and result

## Safety rules

- Never create a project-local worktree without checking ignore rules.
- Never assume a location when project guidance or user preference is absent.
- Never hide baseline failures.
- Do not delete or prune worktrees without explicit authorization.
- Keep the worktree cleanly isolated from unrelated changes in the main tree.
