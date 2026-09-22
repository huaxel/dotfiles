# Pi subagents (Herdr)

Global agent definitions for `pi-shepherdr`. When running inside Herdr,
the `agents` tool is available for delegation without waiting for an explicit
user request. Discovery:
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
—not `subagents_list`. Use `/herdr` to toggle orchestration guidance; the
`agents` tool remains available independently. `/subagent` remains the direct
local agent shortcut.

**Operational prerequisites:** the parent Pi session must run inside Herdr
(`HERDR_ENV=1`) for fleet monitoring. Call `agents` with `action: "help"`
before first use; use `spawn`/`assign` for work and provide a profiled
`agent_type`. For local repository work, use a dedicated worktree when needed.

**Smoke test (in Herdr, parent Pi session, project cwd):**

1. Ask: “Call the `agents` tool with `action: help` and show the result.” (Or read this README / `ls *.md` here.)
2. `/subagent worker Reply exactly: worker-ok`
3. `/subagent reviewer Read pi/agent/agents/README.md and summarize it in one sentence.`

The reviewer test supplies a file it can read; it does not require shell or Git
access.

Requires `PI_CODING_AGENT_DIR=~/dotfiles/pi/agent` and
`npm:@howaboua/pi-shepherdr` in Pi settings.
