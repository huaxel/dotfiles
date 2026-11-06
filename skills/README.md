# Shared agent skills

`skills/` is the source for reusable cross-agent skills. Unix bootstrap links `~/.agents/skills` here; the Windows agent-state sync copies it. Pi discovers that shared root alongside `pi/agent/skills/`. On this machine, `~/.claude/skills` also links to the shared root; that link is not currently provisioned by bootstrap or Home Manager.

## Ownership

- Top-level skill directories are locally maintained or explicitly installed integrations. Keep one canonical copy; use harness links rather than independently edited copies when the content should stay shared.
- `synced/` is vendor-managed source material. Preserve it rather than patching generated copies. Inspect upstream updates, then apply environment-specific selection in harness configuration.
- `pi/agent/skills/` contains Pi-only workflows. Put portable project skills in `.agents/skills/<name>/`, not a harness-specific directory by default.
- Harness-local skills may be intentional overrides. `just doctor-skills` reports shared-name copies without overwriting them. Review the diff and ownership before replacing one; retain originals outside discovery roots.

## Routing

- **be-ambitious:** reconsider the goal; discover what this could become.
- **deepen-task:** improve evidence, methods, and verification within the current goal.
- **agent-defaults:** improve architecture and checks so agents naturally do the right thing.
- **Herdr:** terminal and native-agent control; helper/model selection belongs to the active harness’s delegation workflow.
- **find-skills:** explicitly discover installable capabilities, not a prerequisite for ordinary help.
- **systematic-debugging:** reproduce uncertain failures, test causal hypotheses, and verify fixes without a mandatory planning framework.
- **property-based-testing:** find meaningful invariants, design generators, and classify minimized counterexamples. Complements `tdd`; it does not require a new library for every task.
- **mutation-testing:** explicit-only, bounded campaigns or analysis of surviving mutants. In Pi invoke `/skill:mutation-testing`; ordinary coverage/test requests do not start campaigns.
- **state-machine-audit:** reconstruct hidden lifecycles, transitions, and invalid states from code; audit before proposing structural changes.
- **prove-it:** replace assurances with reproducible empirical or formal checks, stating assumptions, scope, and remaining gaps.
- **blast-radius:** explicitly audit indirect consumers and the critical safety assumptions of a change, then test those assumptions.
- **benchmark-checklist:** explicitly validate a performance comparison’s work, correctness, fairness, variability, and relevance.
- **skill-diet:** explicitly slim or correct a skill using frozen old/new/no-skill comparisons; never launch evaluations merely because a skill was edited.

`systematic-debugging`, `property-based-testing`, and `mutation-testing` are local adaptations of Superpowers (debugging, MIT) and Trail of Bits (property/mutation testing, CC-BY-SA-4.0). Each includes `UPSTREAM.md` with a pinned source revision and change notes, plus its original license. No upstream hooks, executable helpers, tool packages, or required companion plugins were installed. Other harnesses may interpret explicit-only metadata differently; mutation testing also enforces explicit intent in its instructions.

`state-machine-audit` and `prove-it` start from the user’s prompts and incorporate selected pstack practices. Their `UPSTREAM.md` files record the inspected revision and MIT attribution. They do not install pstack’s agents, model routing, toolchain, PR automation, or checkout-reset policies.

`blast-radius` and `benchmark-checklist` are lean pstack adaptations. `skill-diet` adapts Nico Bailon’s methodology, not its executable runner. Each retains pinned source notes and the source MIT license. All three remain explicit-only in Pi, accessible through `/skill:<name>`; no automatic activation is inferred from the pilot below.

## Measured skill changes

The [local evaluation guide](skill-diet/references/evaluation.md) documents the text-only harness, explicit inference budget, frozen source hashes, and fail-closed scorer. Offline regression tests run in CI; CI never makes model calls.

A 12-request pilot compared `blast-radius` and `benchmark-checklist` with no-skill baselines on three reasoning cases each. Both versions passed 3/3 in each suite; manual answer inspection found no material advantage. This is a ceiling-limited pilot, not proof of effectiveness, non-inferiority, or token savings. The [receipt](../scripts/fixtures/skill-eval/pilot-summary.json) retains source hashes and explicitly marks the results historical after subsequent scorer hardening. Records were not rebound to new inputs or presented as new model runs. Broader repeated runtime/tool trials remain necessary before promotion.

Pi’s `pi/agent/settings.json` excludes the synced docs connector, Claude browser/computer-use connectors, Google Workspace connector, Claude memory import, and morning-brief workflow. They depend on capabilities not present in the current Pi setup. Their vendor files remain available to other harnesses. These exclusions are a capability profile, not dynamic tool detection; revisit them if Pi gains the required integrations. A project can explicitly enable an exact skill path with Pi’s `+path` resource override when appropriate.

## Checks

```bash
just check-skills    # fixture tests + catalog metadata and resource checks
just doctor-skills   # also report machine-local duplicate copies and root drift
```

Both `just ci` and `just ci-public` include `check-skills`, including offline evaluator acceptance-gate tests. Python and PyYAML are provided by `nix develop .#ci`.

The checker validates metadata, duplicate names across shared/Pi roots, literal bundled resource references, and local Markdown links in locally maintained SKILL.md files. It does not execute bundled scripts, audit every reference file, verify external URLs, or measure whether a model follows the skill. Synced metadata and literal resource references are checked without rewriting vendor files.

Behavioral cases live under individual skills’ `evals/` directories; they are prepared prompts and graders, not evidence of completed model evaluations. Add cases selectively for consequential workflows and routing boundaries. Reload the relevant harness after changing its skill catalog; in Pi use `/reload`.
