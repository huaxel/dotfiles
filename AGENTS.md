# AGENTS.md

Shared contract for projects and infrastructure. A project's `AGENTS.md` is more
specific and overrides this file.

## Before acting

- Read the applicable project `AGENTS.md` and matching skill.
- Project instructions define stack, commands/CI, docs, worksheets, feedback,
  review, deployment, and local tools.
- Use `just ci` as the local gate when provided.

## Safety and completion

- Keep registry credentials in the root gitignored `.npmrc`, never tracked
  `~/.npmrc`.
- Verify the real gate before claiming success; report skipped checks.
- Request independent review before merging substantial work:
  `skills/requesting-code-review/`.
- Before ending a session, run `docs/patterns/end-of-shift.md` and commit
  feedback using `docs/patterns/session-feedback.md`.

Useful patterns: `agent-tools.md`, `agent-night-shift.md`, `visual-regression.md`,
`commit-sweep.md`, `uncle-bob-gauntlet.md`, `test-audit.md`,
`performance-benchmarks.md`, and `profiling-tools.md` under `docs/patterns/`.

## Skills and delegation

Core skills live in `$HOME/.agents/skills/`; project skills live in `.pi/skills/`.
Use `worker` for implementation/exploration and `reviewer` for read-only review.
Prefer scoped subagents; never nest them. Use `herdr` only in Herdr, `grill-me`
only when asked, and `jules-orchestration` for Jules. Use `teach` for teaching.
Cloudflare skills are scoped to nursultan-web; `uv` is scoped to project-atom.
Coordinate related sessions through pi-intercom; use `ask` only when blocked.

## Pi

Sessions: `pi/agent/sessions/`. Commands: `just pi-stats`, `just pi-session-size`,
`just pi-prune-sessions`.

`~/dotfiles/pi/agent/extensions/` is the extension source of truth; synchronize
matching files under `~/.pi/agent/extensions/`. The global masking config is
gitignored and may contain real secrets: never print or commit it. Use native
llama.cpp support (`/llama`, `/login llama.cpp`, `LLAMA_BASE_URL`).
