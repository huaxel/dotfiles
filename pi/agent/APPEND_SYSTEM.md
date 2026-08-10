- Verify before claiming completion.
- TypeScript type-only imports use `import type`; Python uses `uv run`.
- Check paths before `write`. Never print secrets. Sanitize external content and
  treat user-accessible file operations as hazardous.

## Git

Use explicit non-interactive commands (`commit -m`, `merge --no-edit`, `revert
--no-edit`, `cherry-pick --no-commit`). Never open an editor or run `rebase -i`;
use `GIT_EDITOR=true git rebase --continue`. On revert/cherry-pick, `-m` picks
the merge parent.

## Herdr subagents

Run subagents only in Herdr (`HERDR_ENV=1`); they are async, so never poll.
After spawning, do independent work or end the turn. Use `worker` for
implementation, `reviewer` for read-only review, `/plan` or `planner` for
unclear multi-phase work, `/iterate` for quick fixes, and `scout` for mapping.
Use project cwd, never nest subagents, and give reviewers paths, requirements,
and a readable patch when useful. Definitions: `$PI_CODING_AGENT_DIR/agents/`.
