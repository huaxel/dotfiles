# AGENTS.md

Shared baseline for projects and infrastructure. A more-specific `AGENTS.md`
applies to work below its directory.

## Instruction precedence

1. Safety, security, and explicit user constraints always apply.
2. The nearest applicable project `AGENTS.md` overrides this file's workflow,
   tooling, and style guidance.
3. A project file must not weaken safety rules or authorize destructive actions
   that this file forbids.

## Before acting

- Locate and read the nearest applicable `AGENTS.md` files, then identify the
  skill relevant to the task. If a required skill is unavailable, use the
  documented fallback and report that limitation.
- Inspect `git status` before editing and preserve unrelated local changes.
- Project instructions define the stack, commands/CI, docs, worksheets,
  feedback, review, deployment, and local tools.
- Use `just ci` as the local gate when provided. If it is unavailable or cannot
  run, report the skipped check and why.

## Safety and completion

- In this dotfiles repository, keep registry credentials in the root gitignored
  `npmrc` source. Never print, track, or copy credentials from `~/.npmrc`.
- When writing TypeScript, use `import type` for type-only imports. When using
  Python in project-atom, use `uv run`.
- Use explicit non-interactive Git commands. Never invoke an interactive Git
  editor or run `rebase -i`; use `GIT_EDITOR=true git rebase --continue`. For
  revert or cherry-pick of a merge commit, use `-m <parent>`; ordinary commits
  do not need `-m`.
- Do not use `git reset --hard`, `git clean`, force-push, or destructive
  deployment/migration commands unless explicitly authorized for that task.
- Verify the real gate before claiming success and report skipped checks.
- For substantial implementation changes, request an independent read-only
  review before merging. Use the configured `reviewer` agent when available
  (see `docs/patterns/uncle-bob-gauntlet.md`); otherwise report the limitation.
- For implementation sessions, follow `docs/patterns/end-of-shift.md` as an
  applicable checklist. It is documentation, not a command. Do not commit or
  push automatically: do so only when explicitly requested or when the project
  workflow clearly authorizes it, and never include unrelated changes. Record
  feedback only when the project workflow requires it.

## Completion discipline

Treat every prompt as a complete, scoped work order. Do not stop at a natural
boundary waiting for a nudge.

- Scope the requested task first and define done appropriately: implementation
  may require tests, review, and a gate; review or exploration may require only
  evidence and a report. Commit only when authorized by the rule above.
- Keep going through implementation and verification, fixing failures before
  claiming completion.
- Make sensible decisions from available context. Ask only for information or
  authorization that cannot be safely inferred; otherwise state assumptions
  and tradeoffs in the summary.
- Stop only when genuinely blocked or the work is provably complete. If
  blocked, report the blocker and the minimal unblock.
- For long-running or multi-phase work, use the project's supported continuation
  mechanism (for example, `/goal <task>`) when available.

Useful patterns under `docs/patterns/`, when applicable: `agent-tools.md`,
`agent-night-shift.md`, `visual-regression.md`, `commit-sweep.md`,
`uncle-bob-gauntlet.md`, `test-audit.md`, `performance-benchmarks.md`, and
`profiling-tools.md`.

## Skills and delegation

Core skills live in `$HOME/.agents/skills/`; project skills live in `.pi/skills/`.
Select a skill based on the task rather than reading every skill. In particular,
read `$HOME/.agents/skills/herdr/SKILL.md` before using Herdr and
`$HOME/.agents/skills/fleet/SKILL.md` before multi-issue fleet orchestration.

When delegation is useful and `HERDR_ENV=1`, use the repository's Shepherdr
master mode, then use the `herdr` skill and `agents` tool. Use `/herdr` when orchestration guidance is useful. Use
`worker` for implementation/exploration and `reviewer` for read-only review.
Run review agents read-only
(`--tools read,grep,find,ls`), and never nest agents. For new agents, choose an
explicit Herdr placement and stable name; rely on Shepherdr completion events
rather than polling pane output. Use `grill-me` only when asked,
`jules-orchestration` for Jules, and `teach` for teaching.

Use `agy_execute` (pi-agy) for bulk scaffolding, repetitive refactors, and
exhaustive test generation: default to `mode=plan`, use `accept-edits` only for
scoped batches, and always review the diff and run the project gate after writes.
Reuse `conversation_id`/`continue` for multi-step handoffs. Prefer Cursor for
interactive work; use Herdr for multi-agent review and pane-based delegation
when `HERDR_ENV=1`; use agy for batch work.
Cloudflare skills are scoped to nursultan-web, and `uv` is scoped to project-atom.
Coordinate related sessions through pi-intercom when available.
