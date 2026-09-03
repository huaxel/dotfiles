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
- Before dispatching a batch of model work, consult the live `opencode_usage`
  tooling when available, then pair it with the resolver:
  `~/projects/agentq/bin/resolve-model.sh <small|medium|big>`.
- Treat resolver output and provider availability as runtime state. Do not
  assume a provider, quota window, or model remains available from memory.
- Agentq's quota data does not measure Antigravity capacity; agy model defaults
  use usage balance rather than agentq quota windows.
- Read `~/projects/agentq/docs/agentq.md` for queue safety, trust decisions,
  retries, verification, and worktree behavior before operating the queue.
