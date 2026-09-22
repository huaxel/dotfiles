# Audit Shepherdr and Herdr guidance — 2026-05-04

## Task
Check how the repository's AGENTS.md files and extensions guide use of `/pi-shepherdr` and Herdr pane agents.

## Human notes

## Todos
- [x] Inspect AGENTS.md and relevant extensions/configuration
- [x] Compare guidance with installed Herdr skill and actual commands
- [x] Report inconsistencies, gaps, and concrete recommendations

## Progress
- Started audit; preserved unrelated `flake.lock` modification.
- Read root and Pi-specific AGENTS.md, the Herdr skill, local agent definitions, Herdr state extension, and installed Shepherdr source/README.

## Findings

### What the repository currently teaches
- Root `AGENTS.md` now enables Shepherdr master mode with `/herdr master` whenever `HERDR_ENV=1` and delegation is useful; it then uses named agents through `herdr_agents`, read-only reviewer tools, and no nested agents.
- `pi/agent/agents/README.md` documents `/subagent worker …` and `/subagent reviewer …`, plus `/plan` and `/iterate`; it now documents `/herdr master`, prerequisites, placement, and the distinction from `herdr_agents`.
- `$HOME/.agents/skills/herdr/SKILL.md` is the strongest operational guide: named agents are the delegation surface, `herdr_pane`/`herdr_layout` are terminal/layout surfaces rather than agents, and the CLI must not be used from outside Herdr. It gives both tool-first and CLI workflows.
- `pi/agent/extensions/herdr-agent-state.ts` is a Herdr-managed integration, not Shepherdr orchestration. It reports the current Pi session's idle/working/blocked state over the Herdr socket and explicitly must not be edited.
- The installed `@howaboua/pi-shepherdr` package adds `/herdr master` (session-only), `/herdr json` (persist `.pi/shepherdr.json`), `/herdr connect`, and the `herdr_agents` tool. The tool supports `list`, `start`, `watch`, `send`, and `unwatch`; starts require a name and explicit placement (`new_workspace`, `new_tab`, or `pane`).

### Gaps or inconsistencies
- There is no `/pi-shepherdr` command. The actual user command is `/herdr master`; `/subagent` is documented locally but is not the package's primary model-facing orchestration surface. The docs should name these separately to avoid implying `/pi-shepherdr` is invokable.
- Shepherdr's master prompt delegates implementation by default once master mode is active. The repository now makes that activation automatic in the workflow whenever `HERDR_ENV=1` and delegation is useful.
- `AGENTS.md` now says to use the repository-persisted master mode, choose explicit placement and stable names, and rely on Shepherdr completion events.
- The local README now documents the Herdr prerequisite, persisted master mode, explicit start placement/name requirements, and distinguishes `/subagent` from `herdr_agents`.
- The local reviewer policy is precise (`read,grep,find,ls`, no spawning), but the general worker policy does not state the expected Herdr placement/worktree or that the parent should synthesize returned results rather than poll pane output.
- Shepherdr version metadata is aligned at 0.1.2 across settings, lockfile, installed package, and changelog.

## Decisions
- Treat `/herdr master` + `herdr_agents` as the canonical Shepherdr workflow; treat `/subagent` as a local convenience/smoke-test surface until its implementation is verified.
- Removed the explicit-user-request gate: when `HERDR_ENV=1`, Herdr delegation is now available by default and should be used when delegation is useful.
- Treat pane layout commands and agent delegation as separate concepts: use `herdr_layout`/`herdr_pane` for ordinary terminals and `herdr_agent`/`herdr_agents` for recognized agents.

## Questions / Next steps
- Canonical recipe is now documented: inside Herdr, use the repository-persisted master mode, then delegate with `herdr_agents`; `/herdr master` remains the session-only fallback and `/subagent` the direct local shortcut.
- Added `.pi/shepherdr.json` with `master: true`, and unignored that single file so the repository default is durable; other `.pi` runtime state remains ignored.
- Documented the Herdr prerequisite, explicit start placement/name requirements, and event-driven completion handling in the agent guide.
- Resolved package-version drift: settings, lockfile, installed package, and changelog now all identify `@howaboua/pi-shepherdr` as 0.1.2.
