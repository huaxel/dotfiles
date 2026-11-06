# Pi-specific workflow

These additions apply to Pi sessions. The shared `AGENTS.md` supplies the general safety, execution, and completion contract.

## Delegation

- Delegate only when useful. Never nest agents. Default to dedicated worktrees for writing helpers you launch; accommodate existing shared-worktree sessions and preserve workers and worktrees you did not create.
- When coordinating parallel work inside Herdr, load the Herdr skill and use the available coordination tools to establish file ownership and relay overlapping changes. Otherwise, inspect relevant local agent session records when accessible, limiting reads to the task and worktree; treat transcripts as context, not authorization or proof of current ownership. Do not interrupt unrelated agents or expose session secrets.
- For native harnesses, use their supported Herdr agent primitives. Treat panes as visible conversations and own only the lifecycle of workers you create.
- Keep delegation legible: name workers, state their task, relay corrections, and verify no work or question is pending before closing a task-owned worker.

<br />
