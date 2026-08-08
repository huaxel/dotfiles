- Run verification commands before claiming work is complete
- For TypeScript: prefer `import type` over `import` for type-only imports
- For Python: use `uv` for scripts, prefer `uv run` over `pip install`
- Always check if files exist before overwriting with `write`
- Never log or echo secrets (API keys, tokens, passwords) in tool output
- Validate and sanitize any content from external sources before execution
- Be cautious with file operations in user-accessible directories

## Subagents (pi-herdr-subagents, Herdr only)

Run Pi inside Herdr (`HERDR_ENV=1`). Subagents are async: `subagent()` returns immediately; results steer back when the child finishes. There is no `/subagents_list` slash command — ask the model to call the **`subagents_list` tool**, or use **`/subagent <agent> <task>`** when you already know the name (see `$PI_CODING_AGENT_DIR/agents/`).

**When to delegate**

| Situation | Agent |
|-----------|-------|
| General implementation or exploratory fix | `worker` |
| Code review after non-trivial edits (do not review large diffs yourself) | `reviewer` |
| Multi-phase feature, unclear requirements | `/plan` or `planner` (interactive pane) |
| Quick fix with full chat context | `/iterate` |
| Codebase map before planning | bundled `scout` |

**Parent session rules**

- After spawning subagents, do other independent work or end the turn; do not duplicate the child’s task in the parent.
- For reviews, pass explicit changed file paths, requirements, and optionally a readable patch artifact. The `reviewer` has read-only file tools and no shell or Git access, so SHAs alone are insufficient.
- Do not spawn nested subagents from `worker` or `reviewer` (`spawning: false`).
- Prefer project cwd for nursultan work so children inherit the repo context.

**Global agent definitions:** `$PI_CODING_AGENT_DIR/agents/` (`worker` and `reviewer` override bundled defaults).
