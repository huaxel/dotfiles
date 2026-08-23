# Clean todos.ts lint warnings — 2026-08-24 10:12

## Task
Fix the four pre-existing `deno lint` warnings in `pi/agent/extensions/todos.ts` so the CI gate (`just ci` → check-ts) reports zero lint issues for this extension:
1. `require-await` — `generateTodoId` (line ~977)
2. `no-explicit-any` — `catch (error: any)` (line ~1026)
3. `no-unused-vars` — `listTodosSync` (line ~1110)
4. `require-await` — `ensureTodoExists` (line ~1358)

Constraint: behavior-preserving. `todos.test.mjs` must still pass; keep the public tool contract (`def.name === "todo"`, actions create/list/get/update/claim/release/delete/validate) unchanged. Checked items are claims to verify, not proof — run the tests.

## Human notes
<!-- Goals, constraints, or feedback. The task is scoped; keep the diff minimal and behavior-preserving. -->

## Todos
- [x] Fix `generateTodoId` require-await
- [x] Fix `catch (error: any)` no-explicit-any
- [x] Fix `listTodosSync` no-unused-vars
- [x] Fix `ensureTodoExists` require-await
- [x] Run `todos.test.mjs` and confirm all pass
- [x] Run `deno check`/`deno lint` on `todos.ts` — zero warnings
- [x] Run `just ci` — gate green

## Progress
- Started the lint cleanup prototype on `todos.ts`.
- [x] `generateTodoId`: made synchronous (was async with no await); call site updated.
- [x] `catch (error: any)`: narrowed to `unknown` with structural `code` check for EEXIST.
- [x] `listTodosSync`: removed (dead code — only sync readFileSync user; dropped the now-unused `readFileSync` import).
- [x] `ensureTodoExists`: made synchronous (uses readFileSync + parseTodoContent); all 8 call sites de-awaited.
- [x] Cascade: removed now-unused `readTodoFile`; made `resolveTodoRecord`/`showActionMenu`/`handleSelect` synchronous (they only awaited the de-awaited helpers).
- [x] `deno check` + `deno lint` on `todos.ts`: zero warnings.
- [x] `todos.test.mjs`: all pass (behavior preserved).
- [x] Full `just ci`: gate green; `todos.ts` no longer flagged in check-ts.

## Findings
- `listTodosSync` was dead code with no callers — a sync duplicate of the async `listTodos`.
- Making `ensureTodoExists` sync cascaded three more `require-await` fixes (`readTodoFile` removal, `resolveTodoRecord`, `showActionMenu`/`handleSelect`) — lint surfaced the whole chain.
- A separate pre-existing `herdr-agent-state.ts` lint warning remains (out of scope for this task).

## Decisions
- Removed dead `listTodosSync` rather than keeping an unused function.
- Kept the refactor behavior-preserving: all fs reads still return the same data; only sync/async plumbing changed.

## Questions / Next steps
