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

For current model and quota information, consult the runtime agentq tooling;
do not rely on static quota claims in repository instructions.
