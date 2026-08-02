# Pi subagents (Herdr)

Global agent definitions for `pi-herdr-subagents`. Discovery: `$PI_CODING_AGENT_DIR/agents/` overrides bundled agents in the npm package.

| Agent | Role |
|-------|------|
| `worker` | General implementation, isolated context |
| `reviewer` | Read-only review (`openai-codex/gpt-5.6-luna`, high thinking) |
| `disciplined-worker` | TDD + `just quality` gauntlet; may spawn `reviewer` |

Bundled-only (package): `planner`, `scout`, `visual-tester`. Parent delegation rules: `../APPEND_SYSTEM.md`.

**All names you can pass to `/subagent`:** `worker`, `reviewer`, `disciplined-worker`, `planner`, `scout`, `visual-tester` (plus any `.pi/agents/` in the project).

**User slash commands (Pi prompt):** `/subagent worker …`, `/plan …`, `/iterate` — not `subagents_list`.

**Smoke test (in Herdr, parent Pi session, project cwd):**

1. Ask: “Call the `subagents_list` tool and show the result.” (Or read this README / `ls *.md` here.)
2. `/subagent worker Reply exactly: worker-ok`
3. `/subagent reviewer One sentence: what does git log -1 --oneline show?`

Requires `PI_CODING_AGENT_DIR=~/dotfiles/pi/agent` and `npm:pi-herdr-subagents` in Pi settings.
