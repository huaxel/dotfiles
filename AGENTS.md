# AGENTS.md

Shared operating contract for projects and infrastructure.

## Project contract

Every project has its own `AGENTS.md` covering:

- stack, commands, and the local CI gate (`just ci` where provided);
- worksheets, session feedback, and end-of-shift handoff;
- documentation maintenance;
- code review and deployment;
- project-local agent tools.

Project instructions override this file where they are more specific.

## Non-negotiables

- Never put registry credentials in tracked `~/.npmrc`; use the root,
  gitignored `.npmrc`.
- Run the project's real verification gate before claiming success. Report what
  was not run. See `skills/verification-before-completion/`.
- Request an independent review before merging substantial changes. See
  `skills/requesting-code-review/`.
- Before ending a session, run the end-of-shift checklist and commit session
  feedback. See `docs/patterns/end-of-shift.md` and
  `docs/patterns/session-feedback.md`.
- Use `just ci` as the single local CI entry point when the project provides it.

## Shared patterns

Patterns live in `docs/patterns/`:

| Need | Pattern |
|---|---|
| session feedback | `session-feedback.md` |
| agent tools | `agent-tools.md` |
| autonomous work | `agent-night-shift.md` |
| visual regression | `visual-regression.md` |
| commit review | `commit-sweep.md` |
| end of shift | `end-of-shift.md` |
| hard quality gates | `uncle-bob-gauntlet.md` |
| test quality | `test-audit.md` |
| performance | `performance-benchmarks.md`, `profiling-tools.md` |

## Skills

Core skills live in `$HOME/.agents/skills/`; project skills live in `.pi/skills/`.
Use the skill when the task matches it:

- `requesting-code-review`, `verification-before-completion`;
- `systematic-debugging`, `tdd`, `webapp-testing`;
- `grill-me` when explicitly asked to stress-test a plan;
- `herdr` only for Herdr control;
- `jules-orchestration` for Jules sessions;
- `teach` for teaching requests.

Cloudflare skills are scoped to nursultan-web. The `uv` skill is scoped to
project-atom. Keep the global skill catalog small.

## Agents and delegation

- Use `worker` for implementation and exploration.
- Use `reviewer` for read-only review of non-trivial work.
- Prefer subagents for scoped work; do not spawn nested subagents from workers
  or reviewers.
- Use the lowest thinking level that safely fits the task; raise it for
  architecture, concurrency, security, or hard diagnosis.
- Coordinate related local sessions through pi-intercom. Use `ask` only when
  blocked; use `send` for notifications.

## Pi runtime

Pi sessions live under `pi/agent/sessions/`. Useful commands:

```text
just pi-stats [n=10]
just pi-session-size
just pi-prune-sessions [days=30] [project=dotfiles]
```

### Extensions

`~/dotfiles/pi/agent/extensions/` is the source of truth. Keep matching files
under `~/.pi/agent/extensions/` synchronized; stale duplicates can win at
runtime. The tracked settings entry disabling removed `nan.ts` is intentional.

### Data masking

The global masking config may contain real secrets and is gitignored. Never
commit or print it. Project masking configs contain format rules only. Regenerate
the global config with `node bin/gen-masking-global.mjs` after rotation.

### Llama

Use Pi's native llama.cpp support (`/llama`, `/login llama.cpp`,
`LLAMA_BASE_URL`). Do not recreate the removed custom llama extensions unless
native support cannot solve the requirement.

## Agent definitions

- `worker`: general implementation, debugging, and exploration.
- `reviewer`: read-only code review; give it explicit paths and requirements.

Read the project `AGENTS.md` and the applicable skill before acting.
