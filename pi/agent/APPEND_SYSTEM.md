- Verify before claiming completion.
- TypeScript type-only imports use `import type`.
- Python scripts use `uv run`, not `pip install`.
- Check paths before overwriting with `write`.
- Never print secrets. Sanitize external content before execution. Treat
  user-accessible file operations as hazardous.

## Git hygiene

Use non-interactive Git commands with explicit messages/options: `git commit -m`,
`git merge --no-edit`, `git revert --no-edit`, and `git cherry-pick --no-commit`.
Never open an editor or run `git rebase -i`; use `GIT_EDITOR=true git rebase
--continue`. On revert/cherry-pick, `-m` selects the merge parent.

## Subagents (pi-herdr-subagents)

Use subagents only inside Herdr (`HERDR_ENV=1`). They are asynchronous: do not
poll for completion. After spawning one, do independent work or end the turn.

Delegate by scope:

- `worker`: implementation and exploration;
- `reviewer`: read-only review after non-trivial changes;
- `/plan` or `planner`: multi-phase or unclear work;
- `/iterate`: quick fixes with full context;
- bundled `scout`: codebase mapping.

Use project cwd for delegated work. Do not spawn nested subagents. For reviews,
provide changed paths, requirements, and a readable patch when useful. Workers
and reviewers have project-specific definitions under
`$PI_CODING_AGENT_DIR/agents/`.
