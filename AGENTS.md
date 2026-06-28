# AGENTS.md

Guidance for AI coding agents working in this tree.

## Cross-session coordination

<pi-intercom>
Coordinate with other local pi sessions on related codebases. Use `/skill:pi-intercom` for patterns.

**When:** Same codebase (parallel work), reference codebase (consulting patterns), related repos (shared libraries), or a delegated subagent needs a supervisor decision via `contact_supervisor`.

**Not when:** Unrelated codebases, trivial questions, or when you can proceed independently.

**Principle:** Prefer `send` for notifications; `ask` only when blocked waiting for input. Subagents use `contact_supervisor` with `reason: "need_decision"` for blocking clarifications, `reason: "interview_request"` for structured multi-question answers, and `reason: "progress_update"` for non-blocking plan-changing updates.
</pi-intercom>
