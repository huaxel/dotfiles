---
name: git-noninteractive
description: Use for git operations that might open an editor in a non-interactive agent session.
---

# Non-Interactive Git

An agent terminal may have `EDITOR=nvim` but no usable TTY. Supply commit
messages explicitly or disable the editor for operations that continue or
finalize a commit.

## Safe forms

```bash
# Continue a conflict resolution without opening an editor
GIT_EDITOR=true git rebase --continue

# Commit or amend with the intended message behavior
git commit -m "type(scope): summary"
git commit --amend --no-edit
git commit --amend -m "replacement message"

# Merge/revert/cherry-pick without an editor
git merge --no-edit branch
git revert --no-edit <commit>
git cherry-pick --no-edit <commit>

# Apply a commit without creating it yet
git cherry-pick --no-commit <commit>
```

`-m` on `git revert` or `git cherry-pick` selects a parent for a merge
commit; it is **not** a message flag.

## Do not automate interactively

Do not run `git rebase -i` in an agent session. Ask the user to perform
interactive history editing, or prepare a non-interactive sequence with their
explicit approval. If a command fails or conflicts, stop, report the state, and
preserve the user’s work rather than retrying blindly.
