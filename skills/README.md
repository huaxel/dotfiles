# Shared agent skills

`skills/` is the source for reusable cross-agent skills. Unix bootstrap links `~/.agents/skills` here; the Windows agent-state sync copies it. Pi, Codex, Amp, Gemini CLI, Cursor, and Copilot CLI can discover that shared root according to their current conventions. Claude Code only reads `~/.claude/skills`, so that path is either a single link to this tree or, where it is a real directory, a set of per-skill links added by Home Manager that leave plugin-managed and machine-local entries untouched. Either way the entries point back to the canonical checkout; they are not copied skill files.

## Ownership

- Top-level skill directories are locally maintained or explicitly installed integrations. Keep one canonical copy; use harness links rather than independently edited copies when the content should stay shared.
- `synced/` is vendor-managed source material. Preserve it rather than patching generated copies. Inspect upstream updates, then apply environment-specific selection in harness configuration.
- `pi/agent/skills/` contains Pi-only workflows. Put portable project skills in `.agents/skills/<name>/`, not a harness-specific directory by default.
- Harness-local skills may be intentional overrides. `just doctor-skills` reports shared-name copies without overwriting them. A linked skill directory is a pointer rather than a copy, so a harness-specific variant is not reported as drift. Review the diff and ownership before replacing one; retain originals outside discovery roots.

## Routing

Auto-routed (the model may load these on its own):

- **code-review:** establish the review surface, read for invariants, grade findings by evidence, report a verdict without editing.
- **systematic-debugging:** reproduce uncertain failures, test causal hypotheses, and verify fixes without a mandatory planning framework.
- **be-ambitious:** reconsider the goal; discover what this could become.
- **deepen-task:** improve evidence, methods, and verification within the current goal.
- **agent-defaults:** improve architecture and checks so agents naturally do the right thing.
- **property-based-testing:** find meaningful invariants, design generators, and classify minimized counterexamples. Complements `tdd`; it does not require a new library for every task.
- **prove-it:** replace assurances with reproducible empirical or formal checks, stating assumptions, scope, and remaining gaps.
- **state-machine-audit:** reconstruct hidden lifecycles, transitions, and invalid states from code; audit before proposing structural changes.
- **dawn:** open, review, or share local Markdown, CSV, or JSON deliverables.
- **dream:** maintain Pi memory; correct entries against logs and refresh the wiki.

Explicit-only (`disable-model-invocation: true`; in Pi use `/skill:<name>`):

- **branch-and-release:** audit branches and worktrees, merge with intent, stage explicit paths, and confirm a push or publish landed. Never rewrites shared history.
- **mutation-testing:** bounded campaigns or analysis of surviving mutants; ordinary coverage/test requests do not start campaigns.
- **blast-radius:** audit indirect consumers and the critical safety assumptions of a change, then test those assumptions.
- **benchmark-checklist:** validate a performance comparison’s work, correctness, fairness, variability, and relevance.
- **inference-optimisation:** hill-climb a local model server against a measured ceiling.
- **improve:** produce prioritized implementation plans for another agent; strictly read-only on source.
- **skill-diet:** slim or correct a skill using frozen old/new/no-skill comparisons; never launch evaluations merely because a skill was edited.
- **create-verification-skill:** generate a project-local verification skill that drives the app the way a user does.
- **babysit, split-to-prs, grilling, show-me, wizard, web-perf, design-system-audit, jules-orchestration:** episodic workflows kept one command away.
- **obsidian-\*, json-canvas, defuddle, knap:** personal knowledge and rendering tooling, kept out of the automatic dev surface.

Anything not listed here is either a Pi-only workflow under `pi/agent/skills/`, a project-scoped skill in a repository's `.agents/skills/`, or vendor material under `synced/`. Authoring a new skill uses `synced/.../skill-creator`; slimming an existing one uses `skill-diet`.

## Invocation tiers

Every session pays for the name, description, and path of each auto-routed skill, whether or not it loads. A skill earns automatic routing only if ordinary requests actually reach it; episodic, high-token, or capability-gated skills stay explicit. Both `disable-model-invocation: true` (Pi and Claude) and `agents/openai.yaml` `policy.allow_implicit_invocation: false` (Codex) are needed to enforce a tier across harnesses, and the checker rejects the contradictory combination.

When promoting or demoting a skill, change the tier instead of deleting the file, and record why in the commit message. Remove a skill only for redundancy, wrong-harness content, or a capability this setup does not have.

`systematic-debugging`, `property-based-testing`, and `mutation-testing` are local adaptations of Superpowers (debugging, MIT) and Trail of Bits (property/mutation testing, CC-BY-SA-4.0). Each includes `UPSTREAM.md` with a pinned source revision and change notes, plus its original license. No upstream hooks, executable helpers, tool packages, or required companion plugins were installed. Other harnesses may interpret explicit-only metadata differently; mutation testing also enforces explicit intent in its instructions.

`state-machine-audit` and `prove-it` start from the user’s prompts and incorporate selected pstack practices. Their `UPSTREAM.md` files record the inspected revision and MIT attribution. They do not install pstack’s agents, model routing, toolchain, PR automation, or checkout-reset policies.

`blast-radius` and `benchmark-checklist` are lean pstack adaptations. `skill-diet` adapts Nico Bailon’s methodology, not its executable runner. Each retains pinned source notes and the source MIT license. All three remain explicit-only in Pi, accessible through `/skill:<name>`; no automatic activation is inferred from the pilot below.

`code-review` and `branch-and-release` are locally written. They cover the two largest categories of this machine’s recorded sessions (reviewing a change or repository, and merging or releasing branches) and encode the evidence rules already used elsewhere: cite the file and line, grade each finding by the evidence obtained, stage explicit paths in a shared worktree, and confirm a push with `git ls-remote` rather than an exit code.

## Measured skill changes

The [local evaluation guide](skill-diet/references/evaluation.md) documents the text-only harness, explicit inference budget, frozen source hashes, and fail-closed scorer. Offline regression tests run in CI; CI never makes model calls.

A 12-request pilot compared `blast-radius` and `benchmark-checklist` with no-skill baselines on three reasoning cases each. Both versions passed 3/3 in each suite; manual answer inspection found no material advantage. This is a ceiling-limited pilot, not proof of effectiveness, non-inferiority, or token savings. The [receipt](../scripts/fixtures/skill-eval/pilot-summary.json) retains source hashes and explicitly marks the results historical after subsequent scorer hardening. Records were not rebound to new inputs or presented as new model runs. Broader repeated runtime/tool trials remain necessary before promotion.

Pi’s `pi/agent/settings.json` excludes the synced docs connector, Claude browser/computer-use connectors, Google Workspace connector, Claude memory import, and morning-brief workflow. They depend on capabilities not present in the current Pi setup. Their vendor files remain available to other harnesses. It also excludes the synced research, internal-comms, teaching, and artifact-theming skills, plus `pptx`: these either need a subagent or artifact capability Pi lacks, or never routed in 90 days of recorded Pi sessions while costing the most description budget. These exclusions are a capability and routing profile, not dynamic tool detection; revisit them if Pi gains the required integrations or the work recurs. A project can explicitly enable an exact skill path with Pi’s `+path` resource override when appropriate.

## Checks

```bash
just check-skills    # fixture tests + catalog metadata and resource checks
just doctor-skills   # also report machine-local duplicate copies and root drift
```

Both `just ci` and `just ci-public` include `check-skills`, including offline evaluator acceptance-gate tests. Python and PyYAML are provided by `nix develop .#ci`.

The checker validates metadata, duplicate names across shared/Pi roots, literal bundled resource references, and local Markdown links in locally maintained SKILL.md files. It also rejects Cursor or Codex-app skills copied into the shared catalog: those describe paths such as `~/.cursor/skills/` and products such as Codex Canvas that do not exist here, so an import makes the model route nowhere. Behavioral cases are validated structurally: `case.yaml` needs a matching name and a non-empty outcome, `prompt.md` needs an integer budget and a tool list, and every case needs at least one grader with a type, focus, and numeric weight. Synced vendor files are exempt. The checker does not execute bundled scripts, audit every reference file, verify external URLs, count prompt budget, or measure whether a model follows the skill. Synced metadata and literal resource references are checked without rewriting vendor files.

Behavioral cases live under individual skills’ `evals/` directories; they are prepared prompts and graders, not evidence of completed model evaluations. Add cases selectively for consequential workflows and routing boundaries. A `results/` directory beneath `evals/` holds run outputs and is not treated as a case. Reload the relevant harness after changing its skill catalog; in Pi use `/reload`.
