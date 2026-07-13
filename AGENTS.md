# AGENTS.md

Agentic setup for projects and infrastructure.

## How projects are organized

Every project has a standalone `AGENTS.md` covering:
- **Stack + Commands** — language, tooling, how to run/test
- **Session worksheets** — resume handoff after interruption
- **Session feedback** — what worked / what didn't, committed with work
- **Doc maintenance** — keep PRODUCT.md, DESIGN.md, docs up to date
- **Code review** — request before merge via the review skill
- **Local CI** — `just ci` is the single entry point (no GitHub Actions)
- **Deployment** — `git push` to acerpepe / liedelpi servers
- **Agent tools** — small scripts in `bin/` that agents build as they go

## Cross-project patterns (shared docs)

These live in `$HOME/dotfiles/docs/patterns/` and are referenced by project
AGENTS.md files:

| Pattern | File | When to read |
|---|---|---|
| Session feedback | `docs/patterns/session-feedback.md` | End of every session |
| Agent tools | `docs/patterns/agent-tools.md` | When extracting a script |
| Night-shift loop | `docs/patterns/agent-night-shift.md` | Before autonomous work |
| Visual regression | `docs/patterns/visual-regression.md` | When running VR tests |
| Commit sweep | `docs/patterns/commit-sweep.md` | After a batch of changes |
| End of shift | `docs/patterns/end-of-shift.md` | Before ending a session |
| Test audit | `docs/patterns/test-audit.md` | When suspecting test quality drift |
| Performance benchmarks | `docs/patterns/performance-benchmarks.md` | Before shipping perf-sensitive changes |
| Profiling tools | `docs/patterns/profiling-tools.md` | When optimizing slow code |
| Code review skill | `skills/requesting-code-review/SKILL.md` | Before merge |

## Skills available to all agents

These live in `$HOME/.agents/skills/` or `$HOME/dotfiles/skills/`:

| Skill | When to invoke |
|---|---|
| `requesting-code-review` | Before merging any PR |
| `systematic-debugging` | When debugging a bug or test failure |
| `performance` | When optimizing slow code |
| `security` | At trust boundaries (auth, input, secrets) |
| `tdd` | Test-driven development loop |
| `verification-before-completion` | Before claiming work is done |
| `uv` | Python scripts with `uv run`, `uv add` |
| `git-noninteractive` | Git operations that avoid editor hangs |

## Cross-session coordination

<pi-intercom>
Coordinate with other local pi sessions on related codebases. Use `/skill:pi-intercom` for patterns.

**When:** Same codebase (parallel work), reference codebase (consulting patterns),
related repos (shared libraries), or a delegated subagent needs a supervisor
decision via `contact_supervisor`.

**Not when:** Unrelated codebases, trivial questions, or when you can proceed
independently.

**Principle:** Prefer `send` for notifications; `ask` only when blocked waiting
for input. Subagents use `contact_supervisor` with `reason: "need_decision"`
for blocking clarifications, `reason: "interview_request"` for structured
multi-question answers, and `reason: "progress_update"` for non-blocking
plan-changing updates.
</pi-intercom>
