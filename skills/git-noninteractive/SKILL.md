---
name: git-noninteractive
description: >
  Handle git operations in non-interactive/agent environments where editors
  hang. Use for any git command that might open an editor (rebase, commit,
  merge, revert, cherry-pick).
---

# Git Operations in Non-Interactive Environments

## The Problem

`EDITOR=nvim` and no TTY available. Any git command that opens an editor will **hang forever**.

## Iron Rules

**NEVER** run these commands as-is in a non-interactive agent session:

| Dangerous | Why |
|-----------|-----|
| `git rebase --continue` | Opens editor for commit message |
| `git commit` | Opens editor for commit message |
| `git rebase -i` | Opens interactive todo editor |
| `git merge` (without `--no-edit`) | May open editor for merge commit |
| `git revert` | Opens editor for revert message |
| `git cherry-pick` | May open editor for commit message |

## Safe Alternatives

### Rebase
```bash
# Safe - reuses original message
git rebase --continue --no-edit

# Or use the alias (if configured)
git rbc
```

### Commit
```bash
# Safe - inline message
git commit -m "message"

# Safe - amend without editing
git commit --amend --no-edit

# Safe - amend with inline message
git commit --amend -m "message"
```

### Merge
```bash
# Safe - no editor
git merge --no-edit branch-name

# Safe - inline message
git merge -m "message" branch-name
```

### Revert
```bash
# Safe - inline message
git revert -m "message" commit-hash

# Safe - no edit
git revert --no-edit commit-hash
```

### Cherry-pick
```bash
# Safe - no commit, just stage
git cherry-pick --no-commit commit-hash

# Safe - inline message
git cherry-pick -m "message" commit-hash
```

## Interactive Rebase

**NEVER** run `git rebase -i` in a non-interactive session.

If you need to squash, reword, or reorder commits, describe the changes needed and ask the user to run them interactively.

## Quick Reference

| Operation | Safe Command |
|-----------|-------------|
| Rebase continue | `git rebase --continue --no-edit` |
| Commit | `git commit -m "message"` |
| Amend | `git commit --amend --no-edit` |
| Merge | `git merge --no-edit branch` |
| Revert | `git revert --no-edit commit` |
| Cherry-pick | `git cherry-pick --no-commit commit` |
| Interactive rebase | **Don't do it** |

## When to Apply

- **Any** git operation that might open an editor
- **Before** running `git rebase --continue` after resolving conflicts
- **Before** running `git merge` when a merge commit is expected
- **Before** running `git commit` without `-m`
- **When** you see `EDITOR=nvim` or `EDITOR=vim` in the environment
