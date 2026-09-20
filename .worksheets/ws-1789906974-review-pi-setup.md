# Review Pi setup

## Task

Review my Pi setup and suggest improvements.

## Human notes

<!-- goals, constraints, feedback, or a requested action -->

- research modern setups and skills
- keep it minimal
- focus on agent autonomy rather than the user memorizing tens of prompts

## Todos

- [x] Inventory Pi configuration, extensions, packages, and operational docs
- [x] Evaluate security, maintainability, ergonomics, and verification gaps
- [x] Record prioritized recommendations and evidence

## Progress

- Completed inventory of Pi settings, runtime directories, packages, extensions, skills, model catalog, maintenance recipes, and tests.
- Ran `just pi-healthcheck --json`, targeted extension/package tests, and the full `just ci` gate.
- Researched current Pi autonomy patterns: thin prompt-first loops, on-demand skills, saved workflows, and natural-language subagent delegation.
- Implemented the minimal autonomy, reproducibility, safety, session-routing, and test-gate improvements.
- Preserved both session trees; no session files were deleted or pruned.

## Findings

### Highest priority

1. **Session storage is the clear operational problem.** Health reports 6.07 GiB across 6,512 session files. The source tree has 2.5 GiB / 2,686 files, and the fallback `~/.pi/agent` tree has 3.7 GiB / 4,568 files. More than 4,300 files are older than 30 days. The existing prune/size recipes follow `PI_CODING_AGENT_DIR` and therefore do not manage both trees. Choose one canonical session directory, then add a conservative retention job for the other tree after validating it is no longer active.

2. **There are two configuration authorities.** Pi is currently launched with `PI_CODING_AGENT_DIR=/home/juan/dotfiles/pi/agent`, while `~/.pi/agent` is a separate fallback tree. `settings.json` is identical, but `trust.json` differs by 24 machine/path entries. Keep trust decisions local and machine-specific, or generate them; do not treat a portable tracked trust file as canonical. Untracked `pi/agent/agy-dirlocks/` also shows runtime state is leaking into the repository boundary and should be ignored or relocated.

3. **The package setup is larger than necessary.** Settings load 17 package entries; the npm manifest separately installs 20 direct packages, including stale/unconfigured packages and duplicate provider families (`pi-provider-openference`, Cursor/Ollama/computer-use remnants). `pi-extensions.sh` was a second, stale installer with another package list. Settings remain intentionally floating per the user's preference; the installer now delegates to the canonical install script.

4. **Autonomy has good primitives but no single default workflow.** `go-on` has sensible stopping heuristics and a 15-nudge cap; compaction continuation and autoresearch persist work across context limits; auto-permissions fails closed for its configured rules; Shepherdr provides worker/reviewer roles. However, the human still has to know when to arm `go-on` or invoke a subagent. A short global autonomy contract in `pi/agent/AGENTS.md` plus one saved workflow/skill would make “implement this” mean research → change → verify → independent review → summarize, without memorizing commands.

5. **Safety policy is too narrow for unattended work.** `pi-auto-permissions/config.json` guards only `git commit`, `git push`, and `npm publish`. It does not cover high-impact local operations such as `git reset --hard`, `git clean`, destructive restores, deployment commands, or broad credential/file exfiltration patterns. Add a small destructive-operations group rather than another overlapping permission extension. This remains policy, not a sandbox; Pi's own security docs recommend a container/VM and minimal credentials for untrusted or unattended work.

### Medium priority

6. **Model routing is split across settings, environment, and agent profiles.** The committed settings have no default provider/model and set global thinking to `high`; the current environment selects `openai-codex/gpt-5.6-luna`, `pi-next-cue.json` points to Terra, and worker/reviewer profiles select their own models. The configured model IDs are present in the current catalog, but this is fragile. Define a small role-based model policy in one place, use medium by default, and reserve high thinking for reviewer/architecture work.

7. **One package test path is broken even though repository CI passes.** Extension tests and the full `just ci` gate pass. The package test sweep fails in `pi/packages/pi-multi-opencode-go` because `@juanbenjumea/opencode-go-usage/dist/...` has not been built before tests run. Make that package test build its local dependency first, or test against source exports; add the package test to the project gate.

8. **The autoresearch patch is valid but stale-named.** `pi-autoresearch@1.8.1` installs successfully with a patch named for `1.6.2`; `patch-package --dry-run` reports a version-mismatch warning. Regenerate/rename the patch after reviewing the new upstream version, or pin the dependency to the patched version.

### Recommended minimal target

Keep: Pi core, `go-on`, compaction continuation, auto-permissions, one delegation/reviewer mechanism (Shepherdr or a newer natural-language subagent package, not both), memory, web access, and observability. Make autoresearch opt-in rather than part of every startup. Add one small `autonomous-change` skill or global AGENTS contract; prefer this over installing a large workflow bundle immediately. Consider `pi-load-skill` only if the skill catalog grows enough to affect context.

Modern alternatives worth evaluating in an isolated branch—not installing blindly—are `pi-ouroboros` (prompt-first recoverable loop), `pi-agenticoding` (saved workflows/model groups/handoffs), `pi-subagents` (plain-language delegation), and `pi-load-skill` (on-demand skill loading). Their package pages explicitly warn that they run with Pi's local permissions, so source review and pinning are prerequisites.

### Research references

- https://pi.dev/docs/latest/security
- https://pi.dev/docs/latest/packages
- https://pi.dev/docs/latest/skills
- https://pi.dev/packages/pi-ouroboros
- https://pi.dev/packages/pi-agenticoding
- https://pi.dev/packages/pi-subagents
- https://pi.dev/packages/pi-load-skill

## Decisions

- Keep the setup minimal and centered on autonomous completion, bounded continuation, verification, and safety rather than adding more commands.
- Preserve all existing sessions for token-spend tracking. Future configured shells now write to the canonical dotfiles session tree; the fallback tree remains untouched.
- Keep `pi/agent/settings.json` as the package source of truth; package versions remain intentionally floating, and the legacy installer is now only a compatibility wrapper.

## Questions / Next steps

- Restart Pi or run `/reload` to load the pinned package settings, global autonomy contract, and expanded permission policy.
- Review the working-tree diff and commit when ready; no commit was created automatically.
