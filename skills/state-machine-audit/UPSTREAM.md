# Origin and source notes

The starting prompt came from the user: “find all of the implicit state machines in my app.”

The local workflow and supporting guidance incorporate selected practices from Lauren Tan’s pstack, version 0.15.36 at commit `ae5650febf4320793844c12c4adaa937f417f8da`:

- [principle-prove-it-works](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/principle-prove-it-works/SKILL.md)
- [create-formal-verification-skill](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/create-formal-verification-skill/SKILL.md)
- [statechart](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/statechart/SKILL.md)

Attribution: copyright (c) 2026 Lauren Tan for pstack-derived material. MIT; the source license is retained in [LICENSE](LICENSE). Local additions retain the same license.

This is a locally maintained synthesis, not the upstream pstack skill or plugin. It preserves code/model correspondence, counterexample discipline, and rerunnable evidence, without automatic PRs, prescribed models, mandatory fan-out, destructive checkout cleanup, or implicit tool installation. No pstack executable helper, hook, agent definition, or companion plugin is installed or required.

Only the relevant documentation and playbooks were reviewed. This is not an audit or endorsement of pstack’s executable toolchain, and structural installation checks do not demonstrate this skill’s behavioral effectiveness.
