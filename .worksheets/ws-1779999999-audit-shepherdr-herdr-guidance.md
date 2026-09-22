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
- Root `AGENTS.md` now uses Shepherdr's `agents` tool whenever `HERDR_ENV=1` and delegation is useful; it uses named profiles, read-only reviewer tools, and no nested agents.
- `pi/agent/agents/README.md` documents `/subagent worker …` and `/subagent reviewer …`, plus `/plan` and `/iterate`; it now documents `/herdr`, the `agents` help contract, prerequisites, and profiled delegation.
- `$HOME/.agents/skills/herdr/SKILL.md` is the strongest operational guide: named agents are the delegation surface, `herdr_pane`/`herdr_layout` are terminal/layout surfaces rather than agents, and the CLI must not be used from outside Herdr. It gives both tool-first and CLI workflows.
- `pi/agent/extensions/herdr-agent-state.ts` is a Herdr-managed integration, not Shepherdr orchestration. It reports the current Pi session's idle/working/blocked state over the Herdr socket and explicitly must not be edited.
- The installed `@howaboua/pi-shepherdr` package now adds the always-available `agents` tool, `/herdr` guidance toggle, Herdr-profile discovery, blocking/asynchronous calls, and automatic monitoring.

### Gaps or inconsistencies
- There is no `/pi-shepherdr` command. The actual guidance toggle is `/herdr`; `/subagent` is a local direct-agent shortcut, while `agents` is the package's model-facing orchestration surface.
- Shepherdr 0.2.4 keeps the `agents` tool available independently of `/herdr`; `/herdr` only toggles orchestration guidance.
- `AGENTS.md` now says to use the `agents` tool, profiled agent types, and Shepherdr completion events.
- The local README now documents the Herdr prerequisite, `agents` help contract, profiled delegation, and distinguishes `/subagent` from Shepherdr.
- The local reviewer policy is precise (`read,grep,find,ls`, no spawning), but the general worker policy does not state the expected Herdr placement/worktree or that the parent should synthesize returned results rather than poll pane output.
- Shepherdr is being migrated to 0.2.4 across settings, package manifest, lockfile, installed package, and changelog.

## Decisions
- Treat `/herdr` + the `agents` tool as the canonical Shepherdr workflow; treat `/subagent` as a local convenience/smoke-test surface.
- Removed the explicit-user-request gate: when `HERDR_ENV=1`, Herdr delegation is now available by default and should be used when delegation is useful.
- Treat pane layout commands and agent delegation as separate concepts: use `herdr_layout`/`herdr_pane` for ordinary terminals and `herdr_agent`/`agents` for recognized agents.

## Questions / Next steps
- Canonical recipe is now documented: inside Herdr, call `agents` with `action: "help"`, then use profiled `spawn`/`assign`; `/herdr` toggles guidance and `/subagent` remains the direct local shortcut.
- Removed obsolete `.pi/shepherdr.json`; Shepherdr 0.2.4 reads Herdr profiles instead.
- Documented the Herdr prerequisite, explicit start placement/name requirements, and event-driven completion handling in the agent guide.
- Package migration targets `@howaboua/pi-shepherdr` 0.2.4 across settings, manifest, lockfile, installed package, and changelog.
- Reviewed latest `@howaboua/pi-shepherdr` 0.2.4: local Pi 0.87.0 and Herdr 0.9.1 satisfy its stated Pi 0.84.4+/Herdr 0.9+ requirements. Migration changes the tool to `agents`, removes `shepherdr.json`, makes `/herdr` guidance-only, and moves machine/profile configuration to Herdr.
