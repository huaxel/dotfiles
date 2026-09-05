Based on my review, I've analyzed the full `restart.ts` file against the stated requirements and Pi 0.81.1 API compatibility concerns. Here is my report.

## Files Reviewed
- `pi/agent/extensions/restart.ts` (full file, ~300 lines)

---

## Critical (must fix)

**1. `restart.ts:10` — `@earendil-works/pi-ai/compat` subpath import may not exist in Pi 0.81.1**
The file imports `{ complete, type Message }` from `@earendil-works/pi-ai/compat`. The sibling extension `session-name.ts` imports `complete` from `@earendil-works/pi-ai` (no subpath). If Pi 0.81.1 does not export a `/compat` entry point, the module will fail to load at runtime with an import resolution error. Either drop `/compat` or verify the subpath is explicitly exported in the installed version's `package.json` `exports` field.

**2. `restart.ts:17-21` — `BorderedLoader`, `convertToLlm`, `serializeConversation` may not be public exports**
These are imported as runtime values from `@earendil-works/pi-coding-agent`. No other extension in the repository imports these, and the `pi-coding-agent` package only guarantees `">=0.80.0"`. If they are internal helpers or renamed in 0.81.1, the import will throw at module evaluation time. Dangerous because these are top-level imports — an entire extension crash prevents Pi from registering any of its commands/events.

**3. `restart.ts:136-166` — `getHandoffMessages` compaction reconstruction ordering bug**
The reconstructed branch places the `compaction` entry at index 0, then kept entries, then post-compaction entries. This reverses the temporal order: the compaction summary (which *summarizes* past content) comes *before* the kept entries it summarizes. When passed through `serializeConversation(convertToLlm(...))`, the conversation timeline is scrambled, causing the LLM to generate a handoff prompt with confused context.

Additionally, `convertToLlm` likely maps only `system`, `user`, `assistant`, `tool` roles. The compaction entry is converted to `{ role: "compactionSummary", ... }` by `entryToMessage` — a role not in standard LLM message schema. This entry may be silently dropped or cause a type error inside `convertToLlm`.

**4. `restart.ts:275` — `newSessionResult.cancelled` property name is unverified**
The code checks `newSessionResult.cancelled` but the actual property may be named `canceled` (single-l American spelling) or the return type may be void / a different shape. If the property doesn't exist on the returned object, the post-check notification never fires, and any race condition in the session switch silently swallows errors. Must verify against Pi 0.81.1's actual `ctx.newSession` return type.

---

## Warnings (should fix)

- **`restart.ts:232-251` — Duplicated `notify("Agent stopped", "info")`**  
  Called identically in the `compactOnly` block (line 240) and the main path (line 252). Unnecessary duplicate UI noise. Move it to a single point after the `abort(); waitForIdle()` calls.

- **`restart.ts:237-238` — `ctx.waitForIdle()` may not be on `ExtensionCommandContext`**  
  The `session-name.ts` extension never uses this method. If it doesn't exist at runtime, the call silently returns `undefined` (or throws). Check Pi 0.81.1's type definitions.

- **`restart.ts:195-199` — `ctx.compact({ onComplete, onError })` callback API is unverified**  
  The wrapper converts a callback interface to a Promise. If `ctx.compact` instead returns a Promise directly (or doesn't accept `{onComplete, onError}`), this will never resolve/reject properly. Check Pi 0.81.1's `compact` signature.

- **`restart.ts:45` — `lastPromptedPct` Map memory leak across sessions**  
  Keys are session IDs (strings). Over many `/restart` cycles (>1000 sessions), deleted session entries accumulate. Negligible in practice, but the typical fix is to prune on session switch or use a bounded LRU.

- **`restart.ts:233` — Unhandled rejection from aborted `ctx.ui.select`**  
  The `AFK_TIMEOUT_MS` (60s) abort fires via `AbortController`. If `ctx.ui.select` rejects with `AbortError` instead of returning `undefined`, the entire `turn_end` handler throws. Pi's event dispatch may catch this or may crash the event pipeline. Wrap the select in a try/catch or use the abort signal's `onabort` to gracefully resolve instead of reject.

- **`restart.ts:274` — `parentSession` property name uncertainty**  
  The documented API mentions `ctx.newSession({withSession})`. The property `parentSession` is speculative — it could be `parentSessionId`, `parent`, or missing altogether. Verify against Pi 0.81.1's actual type.

---

## Suggestions (consider)

- **`restart.ts:160` — Use `Array.findLastIndex` instead of reverse scan**  
  `for (let i = branch.length - 1 ...)` works but `branch.findLastIndex(e => e.type === "compaction")` is clearer.

- **`restart.ts:246` — Avoid blocking `notify` calls before async operations**  
  `await ctx.ui.notify(...)` after `abort()` / before `compactSession()` may race with session teardown. The notify returns `Promise<void>`, but if the context is being torn down, this could reject.

- **`restart.ts:84` — `resolveHandoffModel` doesn't cache model lookups**  
  Each `/restart` call re-resolves by scanning the available models. For an `--edit` cycle where the user may toggle back and forth, this is wasted work.

---

## Summary

The extension structure is sound: the `turn_end` guard correctly avoids calling `ctx.newSession()` from an event context (it only writes `/restart` into the editor), the `RE_PROMPT_INTERVAL` mechanism properly gates repeated prompts per session ID, and there is no recursive LLM handoff injection. However, the file has **four critical issues** concerning Pi 0.81.1 API compatibility (subpath imports, non-public runtime imports, unverified return types) plus a compaction reconstruction bug that would corrupt handoff content. **Not ready for merge** — must resolve at least the critical items and verify the API surface against actual Pi 0.81.1 types before committing.

---