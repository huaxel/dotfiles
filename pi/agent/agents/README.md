# Pi subagents (Herdr)

Global agent definitions for `pi-shepherdr`. When running inside Herdr,
master-mode delegation through `herdr_agents` is available without waiting for
an explicit user request. Discovery:
`$PI_CODING_AGENT_DIR/agents/` overrides bundled agents in the npm package.

| Agent | Role |
|-------|------|
| `worker` | General implementation and exploratory work |
| `reviewer` | Read-only code review (`openai-codex/gpt-5.6-luna`, high thinking) |

Bundled-only (package): `planner`, `scout`, `visual-tester`. Parent delegation
rules: `../../AGENTS.md`. Herdr procedures live in
`$HOME/.agents/skills/herdr/SKILL.md`; fleet orchestration uses
`$HOME/.agents/skills/fleet/SKILL.md`.

**All names you can pass to `/subagent`:** `worker`, `reviewer`, `planner`,
`scout`, `visual-tester` (plus any `.pi/agents/` in the project).

**User slash commands (Pi prompt):** `/subagent worker …`, `/plan …`, `/iterate`
—not `subagents_list`. For automatic Herdr orchestration, enable `/herdr master`
and let the parent use `herdr_agents`; this repository persists that setting in
`.pi/shepherdr.json`. `/subagent` remains the direct local agent shortcut.

**Operational prerequisites:** the parent Pi session must run inside Herdr
(`HERDR_ENV=1`). This repository enables Shepherdr master mode through
`.pi/shepherdr.json`; elsewhere use `/herdr master` for the current session.
For `herdr_agents.start`, choose an explicit placement (`new_workspace`,
`new_tab`, or an existing `pane`) and provide a stable agent name.

**Smoke test (in Herdr, parent Pi session, project cwd):**

1. Ask: “Call the `herdr_agents` tool and show the result.” (Or read this README / `ls *.md` here.)
2. `/subagent worker Reply exactly: worker-ok`
3. `/subagent reviewer Read pi/agent/agents/README.md and summarize it in one sentence.`

The reviewer test supplies a file it can read; it does not require shell or Git
access.

Requires `PI_CODING_AGENT_DIR=~/dotfiles/pi/agent` and
`npm:@howaboua/pi-shepherdr` in Pi settings.
