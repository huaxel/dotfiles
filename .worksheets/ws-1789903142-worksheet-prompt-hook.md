# Worksheet prompt hook repair — 2026-09-20

## Task
Resolve the recurring getter-only `systemPrompt` error from `worksheet-loop.ts`.

## Human notes
<!-- goals, constraints, feedback, or a requested action -->

## Todos
- [x] Identify remaining prompt mutation path
- [x] Update the hook to use the supported return value
- [x] Run extension tests and project CI

## Progress
- Confirmed the deployed extension symlink points to `pi/agent/extensions/worksheet-loop.ts` at commit `2a4bb89`.
- Replaced structured prompt mutation with `return { systemPrompt: ... }`, avoiding any event property write.
- Worksheet tests, `just check-ts`, and `just ci` pass.
- Published follow-up commit `a8e1140` to `origin/main`.

## Findings
- The current Pi runtime exposes `event.systemPrompt` as a getter.
- Returning `{ systemPrompt }` is handled by the runtime and is compatible with chained prompt hooks.

## Decisions
- Prefer the explicit hook return over mutating either the event or structured prompt object for maximum runtime compatibility.

## Questions / Next steps
- Reload Pi with `/reload` or restart it so the updated extension module is loaded.
- Unrelated skill deletions and generated `pi/agent/agy-dirlocks/` remain untouched in the working tree.
