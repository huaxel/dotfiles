# Pi project instructions

These instructions apply when working under `pi/`. The repository-level
`AGENTS.md` remains applicable for safety and general workflow.

## Session and extension tooling

- Sessions live in `pi/agent/sessions/`.
- Useful commands are `just pi-stats`, `just pi-session-size`, and
  `just pi-prune-sessions`.
- `pi/agent/extensions/` is the extension source of truth. Synchronize matching
  files under `~/.pi/agent/extensions/` when the project workflow requires it.
- Treat the global masking configuration as secret: never print, inspect for
  content, track, or commit it.
- Use native llama.cpp support through `/llama`, `/login llama.cpp`, and
  `LLAMA_BASE_URL`.

## agentq model routing

- `~/projects/agentq` owns quota collection and model routing for the local
  agent queue. Its usage data is private; never print or commit raw usage,
  pricing, or quota snapshots.
- For agent-facing execution facts, use
  `node ~/projects/agentq/bin/capacity.js`. It reads quota privately and observes
  Pi's authenticated catalog; it neither chooses nor launches a model. Native
  harness auth/catalogs and other machines remain unknown until observed.
- Shepherdr adds Pi-specific coordination on top of Herdr. Its fixed profiles
  are conveniences, not subscription policy; use Herdr primitives for native
  harnesses or Pi workers needing an explicit model.
- Agentq queue `--model auto` and its tier resolver remain separate legacy
  policies, not the capacity-view API. Validate explicit queue models or inspect
  `~/projects/agentq/bin/resolve-model.sh <small|medium|big>` before queue work.
- Missing/stale quota and unresolved model/account scope are uncertainty, not
  proof of available capacity. AGY exhaustion says nothing about other pools.
- Do not run agentq's legacy `update-subagent-models.sh` for Shepherdr: it writes
  obsolete `subagents.agentOverrides`, not active profiles.
- Read `~/projects/agentq/docs/agentq.md` for queue safety, trust decisions,
  retries, verification, and worktree behavior before operating the queue.
