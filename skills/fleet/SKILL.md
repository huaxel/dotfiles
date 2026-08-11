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

- Name convention: `<project>-<issue>` (e.g. `bel-1300`). Helpers get prefixes: `watch-*`, `review-*`, `scout-*`.
- Give each agent a scoped task: the issue text, the target branch, and the definition of done. Keep the brief bounded — the worker inherits no conversation.
- Use a cheap model for implementation agents unless the task warrants a stronger one; use read-only tools for review agents (`--tools read,grep,find,ls`).
- Cap concurrency: do not start more than ~5 agents at once. Provider overload produces aborted runs ("This operation was aborted") — you will have to retry or resume, which is slower than pacing.
- Record the returned pane IDs in your todos; you need them for waiting and cleanup.

### 2. Wait

During an interactive session, **poll — do not spawn watchers.** From your own turns:

```bash
herdr agent get <name>                          # status: idle/working/blocked/done
herdr wait agent-status <pane-id> --status done --timeout 120000
```

A bounded wait blocks only your turn; between checks the user keeps the conversation going. If an agent is `blocked`, it needs input — prompt it or read its pane first.

For **unattended runs** (night, long sessions) where auto-wake is required, spawn one watcher subagent per fleet agent:

```typescript
subagent({
  name: "watch-<issue>",
  agent: "worker",
  task: "Block on `herdr agent wait` for agent <name> (<pane-id>). When it settles done, read its final output and report a one-paragraph summary with the PR number.",
  thinking: "low",
});
```

Watchers are cheap and close on done. Do **not** `/reload` or `/restart` while subagents are in flight — their watchers die and completions are lost. After an unexpected reload, resume interrupted work with `subagent_resume`.

### 3. Review gate

Every landed PR gets an independent review before merging (AGENTS.md contract). Use a short-lived reviewer subagent with the PR's SHA range:

```typescript
subagent({
  name: "review-<issue>",
  agent: "reviewer",
  cwd: "<repo-root>",
  task: "Review PR #N (<base>...<head>, SHAs). Report only actionable findings: correctness, security, regressions.",
});
```

Collect findings, fix Critical/Important items yourself or dispatch a follow-up, then re-review only the delta. Skip nothing: the gate is the reason the fleet is safe.

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
