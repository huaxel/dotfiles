# Pi-specific workflow

These additions apply to Pi sessions. The shared `AGENTS.md` supplies the general safety, execution, and completion contract.

## Delegation

- Delegate only when useful. Never nest agents. Default to dedicated worktrees for writing helpers you launch; accommodate existing shared-worktree sessions and preserve workers and worktrees you did not create.
- When coordinating parallel work inside Herdr, load the Herdr skill and use the available coordination tools to establish file ownership and relay overlapping changes. Otherwise, inspect relevant local agent session records when accessible, limiting reads to the task and worktree; treat transcripts as context, not authorization or proof of current ownership. Do not interrupt unrelated agents or expose session secrets.
- When the bundled `pi-subagent` package is active, use its skill and CLI for Pi helpers. `stop` retains history; `resume` reopens it. Never purge retained history without explicit authorization.
- For native harnesses, use their supported Herdr agent primitives. Use Shepherdr for Pi coordination only when it is active and pi-subagent is not; otherwise follow the active helper’s skill. Treat panes as visible conversations and own only the lifecycle of workers you create.
- Keep delegation legible: name workers, state their task, relay corrections, and verify no work or question is pending before closing a task-owned worker.

## Capacity and routing

- When capacity information matters, use the read-only capacity view (`node ~/projects/agentq/bin/capacity.js` as CLI fallback). No preflight is needed for ordinary local work.
- Distinguish machine, harness, account, model access, and quota freshness. Unknown is not available or exhausted; shared quota buckets are not independent. Never print or commit raw usage, quota, or pricing snapshots.
- Optional observations: `liveQuota` for bounded local Go/Openference usage, `nativeQuota: "agy"` for AGY usage, `nativeDaemon: "codex"` for an already running Codex daemon, and saved machines for read-only remote observations. These do not establish model entitlement or automatic failover.
- On quota exhaustion, inspect partial work and checks, stop the former writer, then choose a valid alternative. Do not enable overages or blindly replay.
- pi-agy is opt-in. Independent review does not require cross-provider models.
- Agentq queue `--model auto` and its tier resolver are separate legacy policies. Before queue work, read `~/projects/agentq/docs/agentq.md`; inspect `resolve-model.sh <small|medium|big>` when validating its explicit tiers. Do not run the legacy `update-subagent-models.sh` for Shepherdr.
