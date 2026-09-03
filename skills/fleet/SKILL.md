---
name: fleet
description: "Run the multi-issue pipeline: dispatch issues to parallel worktree agents, monitor their completion, run a review gate, merge, and clean up. Use when the user wants multiple issues implemented in parallel worktrees, asks to dispatch or spawn a fleet of agents, or wants the issue-to-PR loop. Requires HERDR_ENV=1 and a git repo with gh available."
---

# Fleet

The issue-to-PR pipeline: n issues → n worktree agents → review gate → merge → cleanup. The mother (this agent) stays in the main branch and keeps discussing with the user while the fleet works.

For tool mechanics (IDs, `--no-focus`, safety rules, pane control) follow the `herdr` skill. For helper roles follow the one-spawn rule: **work gets a named Herdr agent; helpers that must report back use `subagent()`; terminals are not agents.**

## When to run

The user asks to dispatch multiple issues, run a fleet, or work through a batch of issues to merged PRs. Preconditions:

- Issues are scoped and independent (no overlapping files between worktrees).
- `gh` is authenticated and the main branch is clean.
- This agent runs inside Herdr (`test "${HERDR_ENV:-}" = 1`).

## The loop

### 1. Dispatch

Per issue: create a worktree, then start a named agent in it.

```bash
herdr worktree create <repo> <branch>          # or: herdr worktree open
herdr agent start <project>-<issue> --cwd <worktree-path>
```

- Name convention: `<project>-<issue>` (e.g. `bel-1300`). Helpers get prefixes: `review-*`, `scout-*`.
- Give each agent a scoped task: the issue text, the target branch, and the definition of done. Keep the brief bounded — the worker inherits no conversation.
- Use a cheap model for implementation agents unless the task warrants a stronger one; use read-only tools for review agents (`--tools read,grep,find,ls`).
- Cap concurrency: do not start more than ~5 agents at once. Provider overload produces aborted runs ("This operation was aborted") — you will have to retry or resume, which is slower than pacing.
- Record the returned pane IDs in your todos; master mode (`herdr_agents watch/start`) steers back automatically (see next step).

### 2. Wait

The mother is steered automatically when a fleet agent settles — no polling, no watcher subagents, works in unattended runs. Enable master mode once (`/herdr json` in the control directory, or `/herdr master` for the current session), then every `start` is watched automatically and `watch`/`send` on an existing agent opts in:

```typescript
herdr_agents({ action: "start", name: "<agent-name>", placement: ..., prompt: "<initial task>" });
// or after herdr agent start:
herdr_agents({ action: "watch", target: "<agent-name-or-pane-id>" });
```

Completion and blocked events steer the mother with the full worker response; a blocked event includes the pane ID and concrete herdr commands. Between steers, keep discussing with the user; the steer arrives as a new turn when the session is idle.

If master mode is unavailable (extension not loaded), fall back to polling from your own turns:

```bash
herdr agent get <name>                          # status: idle/working/blocked/done
herdr wait agent-status <pane-id> --status done --timeout 120000
```

A bounded wait blocks only your turn; between checks the user keeps the conversation going. If an agent is `blocked`, it needs input — prompt it or read its pane first.

Do **not** `/reload` while subagents (reviewers) are in flight — their watchers die and completions are lost. After an unexpected reload, resume interrupted work with `subagent_resume`.

### 3. Review gate

Every landed PR gets an independent review before merging (AGENTS.md contract). Start a **read-only review agent** and watch it — the review must never edit files:

```typescript
herdr_agents({
  action: "start",
  name: "review-<issue>",
  placement: { kind: "new_tab", workspace: "<fleet-workspace>" },
  prompt: "Review PR #N (<base>...<head>). Report only actionable findings: correctness, security, regressions.",
});
herdr_agents({ action: "watch", target: "review-<issue>" });
```

Start the review agent with read-only tools (`herdr agent start <name> --kind pi --pane <id> -- --tools read,grep,find,ls`) whenever tool shaping is needed. Collect findings, fix Critical/Important items yourself or dispatch a follow-up, then re-review only the delta. Skip nothing: the gate is the reason the fleet is safe.

### 3b. Model choice: cost and quota

Pick helper models with the quota-aware resolver, not by habit:

```bash
~/projects/agentq/bin/resolve-model.sh small    # → configured provider/model
~/projects/agentq/bin/resolve-model.sh medium
~/projects/agentq/bin/resolve-model.sh big
~/projects/agentq/bin/resolve-model.sh check <model>   # validate a model has headroom
```

- **Routine work** (review, scout, quick fixes): `small`/`medium` tier.
- **Escalate only when the task warrants it** (architecture, concurrency, security, hard diagnosis): `big`.
- Before a batch, take a snapshot: `opencode_usage({})` — per-provider quota windows, recent spend per model, OpenCode Go dashboard windows and cooldowns. Optionally look up a model's price: `opencode_usage({ model: "deepseek-v4-flash" })`.
- If quota is high or cooldowns are active, spread dispatches or downgrade a tier — provider aborts ("This operation was aborted") are a quota symptom; retrying into a cooled-down provider is slower than pacing.
- Pass the resolved model explicitly when starting helpers: `herdr agent start <name> --kind pi --pane <id> -- --model <model>`.

**Providers change over time** (added/removed ifv price, e.g. nous portal). The live provider set is derived from `~/.pi/agent/auth.json` — `opencode_usage` lists it; never assume a provider still exists from memory. When the user adds or removes a provider, the agentq data pipeline must follow: refresh pricing/quota collection (agentq `bin/collect-*.js`, cron-update-tiers.sh) and the tier lists in `agentq/src/lib/quota-resolver.js`. If a configured provider is missing from `opencode_usage`'s output, flag it instead of silently picking from the old set.

### 4. Merge and cleanup

The mother does merge and cleanup directly — do not delegate it:

```bash
gh pr view <n> --json state
gh pr merge <n> --merge --delete-branch
```

Then remove the worktree and close the agent once its branch is merged:

```bash
herdr worktree remove <worktree-path>
herdr agent close <name>        # or: herdr pane close <pane-id>
```

Update and close the issue only after the PR is merged. Remove the worktree even if the agent pane is still open.

## Rules

- One agent per worktree; one issue per agent.
- Read before waiting: inspect `herdr agent get` / `pane read` first, then wait for the next state you expect.
- Never merge without the review gate; never close an issue before the merge.
- Clean up as you go (worktree + agent per merged PR), not in one pass at the end.
- If a run crashes on a provider error, retry once or resume the session; if it fails twice, tell the user instead of looping.
