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
- TypeScript type-only imports use `import type`; Python uses `uv run`.
- Use explicit non-interactive Git commands. Never open an editor or run
  `rebase -i`; use `GIT_EDITOR=true git rebase --continue`. On revert or
  cherry-pick, use `-m` to select the merge parent.
- Verify the real gate before claiming success; report skipped checks.
- Request independent review before merging substantial work: dispatch the
  configured read-only `reviewer` agent (see `docs/patterns/uncle-bob-gauntlet.md`).
- Before ending a session, run `docs/patterns/end-of-shift.md` and commit
  feedback using `docs/patterns/session-feedback.md`.

## Completion discipline (no "go on" loop)

Treat every prompt as a complete work order, not a single step. Do not stop at
natural boundaries waiting for a nudge; carry the task through to done.

- **Scope the whole task first**: list the steps, define what done means
  (tests, gate, commit), and state any assumptions before acting.
- **Keep going through verification**: implement, run the real gate
  (`just ci` where provided), fix failures, then commit when green.
- **Don't fish for permission**: decide with the available context; if a
  tradeoff needs input, make the sensible default and flag it in the summary
  instead of round-tripping.
- **Stop only when genuinely blocked or the work is provably complete** — never
  because a step happened to finish. If blocked, report the blocker and the
  minimal unblock, don't ask open-ended questions.
- For long-running or multi-phase work, prefer `/goal <task>` so continuation
  is automatic; reserve one-word nudges for steering, not permission.

Useful patterns: `agent-tools.md`, `agent-night-shift.md`, `visual-regression.md`,
`commit-sweep.md`, `uncle-bob-gauntlet.md`, `test-audit.md`,
`performance-benchmarks.md`, and `profiling-tools.md` under `docs/patterns/`.

## Skills and delegation

Core skills live in `$HOME/.agents/skills/`; project skills live in `.pi/skills/`.
Read the applicable skill before acting. In particular, read
`$HOME/.agents/skills/herdr/SKILL.md` before using Herdr; also read
`$HOME/.agents/skills/fleet/SKILL.md` for multi-issue fleet orchestration.
Use `worker` for implementation/exploration and `reviewer` for read-only review.
Delegate via named Herdr agents (`herdr_agents` from pi-shepherdr); run review agents read-only
(`--tools read,grep,find,ls`). Never nest agents. Use `herdr` only in Herdr, `grill-me`
only when asked, and `jules-orchestration` for Jules. Use `teach` for teaching.
Use `agy_execute` (pi-agy) for bulk scaffolding, repetitive refactors, and exhaustive
test generation on Antigravity quota: default to `mode=plan`, use `accept-edits` only
for scoped batches, and always review the diff and run `just ci` after writes. Reuse
`conversation_id`/`continue` for multi-step handoffs. Prefer Cursor for interactive
work and Herdr for multi-agent review; use agy when burning Antigravity quota on
batch produce.
Cloudflare skills are scoped to nursultan-web; `uv` is scoped to project-atom.
Coordinate related sessions through pi-intercom; use `ask` only when blocked.

## Pi

Sessions: `pi/agent/sessions/`. Commands: `just pi-stats`, `just pi-session-size`,
`just pi-prune-sessions`.

`~/dotfiles/pi/agent/extensions/` is the extension source of truth; synchronize
matching files under `~/.pi/agent/extensions/`. The global masking config is
gitignored and may contain real secrets: never print or commit it. Use native
llama.cpp support (`/llama`, `/login llama.cpp`, `LLAMA_BASE_URL`).
