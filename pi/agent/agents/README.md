# Pi helpers through Shepherdr / Herdr

Active Shepherdr definitions are `../shepherdr/profiles/*/profile.json`.
The Markdown roles here are legacy definitions for other consumers; installed
Shepherdr 0.2.14 does not use them or `subagents.agentOverrides`.

Shepherdr adds Pi-session reply collection, asynchronous reports, attributed
peer messages, question handling and optional shared context on top of Herdr.
It coordinates **Pi workers**, not every native harness. Herdr's
`herdr_layout` / `herdr_agent` tools control native Claude, AGY, Copilot, Codex,
etc., and Pi workers with explicit model arguments.

| Profile | Purpose |
|---|---|
| `general` | Stable implementation convenience; dedicated task worktree |
| `explorer` | Read-only discovery; file tools only, MCP disabled |
| `reviewer` | Independent read-only review; file tools only, MCP disabled |

Profiles are not the subscription routing policy. Call `agents help` before
use, and inspect the profile's current model when deciding whether it fits.
Use explicit Herdr placement, preserve focus, and prefer completion events over
polling. `/herdr` is the optional control panel; `/subagent`, `/plan` and
`/iterate` are not commands supplied by this installed Shepherdr.

Before selecting capacity, inspect `node ~/projects/agentq/bin/capacity.js`.
Pi chooses a valid machine/harness/subscription/model path using observed facts
and uncertainty. Do not rewrite profiles to emulate per-call routing. Native
harness catalogs and auth are not inferred from Pi's catalog.

Reviewers need requirements, changed paths, checks already run and a readable
patch for diff review: file-only reviewers cannot run Git. On exhaustion,
inspect partial work and stop the former writer before handing remaining work
to another valid path. Read-only tools are not an OS sandbox.

Full architecture: `../../../docs/patterns/subscription-routing.md`.
