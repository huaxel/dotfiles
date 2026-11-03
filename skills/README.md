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

These three development-method skills are local adaptations of Superpowers (debugging, MIT) and Trail of Bits (property/mutation testing, CC-BY-SA-4.0). Each includes `UPSTREAM.md` with a pinned source revision and change notes, plus its original license. No upstream hooks, executable helpers, tool packages, or required companion plugins were installed. Other harnesses may interpret explicit-only metadata differently; mutation testing also enforces explicit intent in its instructions.

Pi’s `pi/agent/settings.json` excludes the synced docs connector, Claude browser/computer-use connectors, Google Workspace connector, Claude memory import, and morning-brief workflow. They depend on capabilities not present in the current Pi setup. Their vendor files remain available to other harnesses. These exclusions are a capability profile, not dynamic tool detection; revisit them if Pi gains the required integrations. A project can explicitly enable an exact skill path with Pi’s `+path` resource override when appropriate.

## Checks

```bash
just check-skills    # fixture tests + catalog metadata and resource checks
just doctor-skills   # also report machine-local duplicate copies and root drift
```

Both `just ci` and `just ci-public` include `check-skills`. Python and PyYAML are provided by `nix develop .#ci`.

The checker validates metadata, duplicate names across shared/Pi roots, literal bundled resource references, and local Markdown links in locally maintained SKILL.md files. It does not execute bundled scripts, audit every reference file, verify external URLs, or measure whether a model follows the skill. Synced metadata and literal resource references are checked without rewriting vendor files.

Behavioral cases currently live under `be-ambitious/evals/` and the three development-method skills’ `evals/` directories; they are prepared prompts and graders, not evidence of completed model evaluations. Add cases selectively for consequential workflows and routing boundaries. Reload the relevant harness after changing its skill catalog; in Pi use `/reload`.
