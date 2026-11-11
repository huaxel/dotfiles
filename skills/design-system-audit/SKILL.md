---
name: design-system-audit
description: Find implicit design-system components and repeated UI patterns in a web app. Use for design consistency audits, undocumented component discovery, or componentization opportunities—even when the user does not say “design system.” Inspect project guidance and implementation, distinguish shared primitives from local recipes, cite evidence, prioritize worthwhile consolidation, and state coverage limits. Default to read-only; implement only when explicitly asked.
---

# Design System Audit

Map the reusable UI contracts a codebase already implements, including patterns hidden in markup, utility classes, CSS, and conventions. Produce evidence and restrained recommendations—not a component wishlist or redesign.

## Method

1. Inspect repository instructions and `git status`; preserve existing work. Read the design docs, token sources, shared-component API, exports/catalog, and drift checks before surveying screens. Treat implementation as evidence and docs as intent.
2. Map the explicit primitives and their ownership. Search app routes, local components, and styles for repeated structure, appearance, states, and behavior. Compare candidate instances; class-name similarity alone is not proof. Use UI families (actions, fields, surfaces, feedback, overlays, data display, navigation, identity, loading/empty/error) as search leads, not a checklist.
3. Separate shared primitives, implicit local twins, genuinely missing shared patterns, and domain-specific compositions. A one-off or domain component is not automatically a design-system primitive. Note documentation/code drift and label uncertain inferences.
4. Prioritize only a few opportunities by repetition, user-visible inconsistency, accessibility/behavior risk, and blast radius. Recommend the smallest useful shared API or recipe; explain when a pattern should remain local.
5. Report exactly which apps/packages/routes or representative files you inspected, what was excluded, and whether coverage is scoped or exhaustive. A search is not proof of completeness.

## Report

# Implicit Design-System Audit

- **Summary:** existing explicit foundation and main finding.
- **Explicit foundation:** authoritative docs, tokens, primitives, catalogs, and enforcement.
- **Implicit inventory:** table of pattern, repeated contract/variants, concrete source paths, and relation to shared primitives. Group examples; distinguish confirmed repetition from candidates needing review.
- **Priorities:** ranked, concise consolidation opportunities with evidence, rationale, smallest next step, and confidence.
- **Coverage:** inspected surfaces, exclusions, dirty-worktree caveats, and limits. Do not imply visual/runtime verification from source review alone.

Stay read-only unless implementation is explicitly requested. Do not claim complete discovery from keyword matches or recommend abstraction without evidence.
