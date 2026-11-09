# Pi-specific workflow

These additions apply to Pi sessions. The shared `AGENTS.md` supplies the general safety, execution, and completion contract.

## Delegation

- Delegate only when useful. Never nest agents. Default to dedicated worktrees for writing helpers you launch; accommodate existing shared-worktree sessions and preserve workers and worktrees you did not create.
- When coordinating parallel work inside Herdr, load the Herdr skill and use the available coordination tools to establish file ownership and relay overlapping changes. Otherwise, inspect relevant local agent session records when accessible, limiting reads to the task and worktree; treat transcripts as context, not authorization or proof of current ownership. Do not interrupt unrelated agents or expose session secrets.
- For native harnesses, use their supported Herdr agent primitives. Treat panes as visible conversations and own only the lifecycle of workers you create.
- Keep delegation legible: name workers, state their task, relay corrections, and verify no work or question is pending before closing a task-owned worker.

## Memory and knowledge layers

- Long-term memory: `~/.pi/agent/memory/MEMORY.md` (INDEX at top is dream-maintained; entries are append-ordered ground truth). Correct stale facts with `memory_forget`, never raw deletion of old entries.
- Project status wiki: `~/.pi/agent/memory/wiki/<slug>.md` — maintained ONLY by the dream pass (`/skill:dream`). Do not edit those pages in normal sessions; record new project facts in memory instead. Open that folder in any Markdown viewer; it is not part of Obsidian.
- Dream pass: `/skill:dream` corrects memory against logs, distills dailies, and refreshes the INDEX. Cadence is event-driven, not clock-scheduled: propose running it when (a) a project milestone lands (release, cutover, locked decision, major merge), (b) a daily log is unusually large (>40KB of undistilled work), or (c) an in-session memory correction revealed drift. Otherwise run it only when asked.

<br />
