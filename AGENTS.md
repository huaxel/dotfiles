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

## Secrets hygiene

- `~/.npmrc` is a **symlink to `npmrc`** (git-tracked) — never put registry
tokens there; they'd get committed and GitHub push protection will reject the
push. Registry auth lives in `.npmrc` (root, gitignored) which npm picks up by
walking up from any package dir under this repo.
- npm publish auth: granular access token with **Bypass 2FA** enabled, `Read and
write` on all packages, max 90-day lifetime. The `just pi-publish-*` recipes
need nothing extra once `.npmrc` holds the token.
- Current token (`dotfiles-publish`, …dgQL) expires **~Oct 30 2026**; publish
will silently 403 after that — regenerate and update `~/.npmrc` before then.
- npm deprecates bypass-2FA *direct publishing* around **Jan 2027** (staging +
human approval, or OIDC trusted publishing for CI) — revisit before the cutoff.

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
| Uncle Bob gauntlet | `docs/patterns/uncle-bob-gauntlet.md` | Before every agent task — the hard quality gates |
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
| `tdd` | Test-driven development loop |
| `verification-before-completion` | Before claiming work is done |
| `git-noninteractive` | Git operations that avoid editor hangs |
| `using-git-worktrees` | Feature work needing an isolated checkout |
| `grill-me` | When asked to stress-test a plan/design |
| `herdr` | Only inside Herdr, for pane/agent control |
| `jules-orchestration` | Dispatching scoped tasks to Jules |
| `webapp-testing` | Playwright checks of local web apps |
| `teach` | Teaching a skill/concept in this workspace |

Parked/scoped: `performance`, `security` (generic priors, see
`skills-parked-20260807/`), `uv` (moved to project-atom), Cloudflare stack
(project-scoped to nursultan-web).

## Before merge / end of session

Before merging or ending a session:

- **Request code review** before merging any PR (`requesting-code-review`).
- **Verify before claiming success** — run the project's real gate, inspect the
  diff, and report what was not run (`verification-before-completion`).
- End of shift: run the `end-of-shift` pattern
  (`docs/patterns/end-of-shift.md`) and commit session feedback
  (`docs/patterns/session-feedback.md`) with the work.

## Pi session management

```
just pi-stats [n=10]         # Show last N session costs & duration
just pi-session-size         # Disk usage per project
just pi-prune-sessions [days=30] [project=dotfiles]  # Prune old session files
```

Key settings: `defaultThinkingLevel=low`, context guard at 80% (auto-/restart).
Session files live in `pi/agent/sessions/` (~226 MB total across all projects).

## Agent definitions

- **`worker`** (`pi/agent/agents/worker.md`) — General-purpose implementation,
  debugging, and exploration.
- **`reviewer`** (`pi/agent/agents/reviewer.md`) — Read-only code review specialist.
  Give it explicit changed file paths and requirements; it has no shell or Git access.

## Agent preferences

- Use `worker` for implementation and exploratory work.
- Use `reviewer` before merging major features, complex fixes, or non-trivial refactors.
- Apply TDD and project verification commands when the task or project requires them;
  do not impose a universal hard-gate agent on docs/config work.
- **Subagent over workflow** — Prefer `subagent` for delegation (single/parallel/chain).
  Only use `workflow` when JS orchestration (loops, retry, quality gates) is genuinely
  needed; otherwise it's redundant ceremony with worse reliability in this setup.

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

## Pi extension loading (2026-08-07)

With `PI_CODING_AGENT_DIR=~/dotfiles/pi/agent` set, pi auto-discovers extensions from
**both** `~/dotfiles/pi/agent/extensions/*.ts` **and** `~/.pi/agent/extensions/*.ts`.
Keep them in sync — a file present in only one tree loads from that tree, and
stale duplicates in `~/.pi/agent/` are dead weight:

- The git-tracked tree `~/dotfiles/pi/agent/extensions/` is the source of
  truth for changes; keep `~/.pi/agent/extensions/` in sync with it (same file
  names, same content) or a stale copy in the runtime tree silently won.
- It's a two-way hazard: an edit to `~/dotfiles/pi/agent/extensions/*.ts`
  does nothing at runtime unless the matching `~/.pi/agent/extensions/*.ts`
  also updates.
- (2026-08-07: quarantined `nan.ts` + `herdr-omp-agent-state.ts` →
  `~/.pi/agent/extensions-quarantine-20260807/`.)
- `settings.json` `extensions: ["-extensions/nan.ts"]` disables that file (now gone; entry kept for safety).

### pi-data-masking — global config holds REAL secrets (2026-08-09)

`@sevten/pi-data-masking` (npm package) masks sensitive values in LLM context
and unmasks at tool boundaries. Two configs, merged project-first:

- **Global** `pi/agent/pi-data-masking/masking.config.json` — literal rules for
  env API keys, GitHub CLI oauth token, internal hostnames (`acerpepe`,
  `liedelpi`, and the two configured `*.bonobo-fort.ts.net` FQDNs), plus
  format regex rules (connection strings, bearer/JWT/GitHub/npm/HF/AWS
  tokens, PEM keys, private IPs).
  **This file embeds REAL secret values: it is gitignored — never commit it.**
  Regenerate after key rotation: `node bin/gen-masking-global.mjs` (reads
  values from env/files without printing them).
- **Project** `<project>/.pi/pi-data-masking/masking.config.json` — format rules
  only, no secrets. Atom has Belgian PII rules (NISS, VAT, IBAN, email, phone)
  as context-level defense-in-depth under the `.pi-pii.yaml` column perimeter.

Extension loads at pi startup (restart to activate). Verify a rule with
`/masking-test`; monitor over-masking via the stats panel. The
`keyword_value_pairs` rule requires standalone sensitive field names, so
ordinary `sort_key:`/`foo_token:` fields are not masked.

### llama.cpp — native support, no custom extensions

Pi ships **native llama.cpp** (`/llama` command, `/login llama.cpp`, `LLAMA_BASE_URL`, HF model download).

The old custom `pi-llama.ts` (thinking-budget mapping + overflow compaction) and
`llama-stats.ts` (KV/slot monitoring) are **gone** — removed when llama.cpp
moved to a native backend (see removal history). No `*.ts` extension references
llama today; `slots.ts` is unrelated (quota routing across cloud providers).

If new llama needs emerge, route them through native `/llama` first; only
re-add a custom extension for something native genuinely can't do.

## Skill catalog (2026-08-07)

- **Cloudflare stack** (cloudflare, cloudflare-one, cloudflare-one-migrations, cloudflare-email-service,
  durable-objects, sandbox-sdk, workers-best-practices, wrangler, turnstile-spin, web-perf) is now
  **project-scoped to nursultan-web** at `~/.pi/skills/` there (`.pi/skills` in that repo). Do NOT
  re-add globally — it only applies to nursultan.
- **`orchestrator` skill parked** at `skills-parked-20260807/orchestrator` — agentq orchestrator is
  not mature (no `:8090` queue running). The `orchestrator` word in worker.md/reviewer.md refers to
  the subagent-driver flow, NOT the parked queue skill.
- On-demand model: pi indexes skill names+descriptions at startup; full SKILL.md loads only when used.
  Keep the global catalog small (12 live skills: 11 in the table above + `worksheet-loop`).

- **`uv` skill (Python tooling) moved to project-atom** `.pi/skills/` — ~99% of uv usage is in atom (its
  worktrees too). The system prompt still says "prefer uv run over pip" as a general rule; the skill
  itself lives in atom now.