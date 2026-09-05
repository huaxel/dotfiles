I have a thorough understanding of the codebase from the file I read. Here is my complete analysis.

---

## Files Reviewed

- `pi/agent/extensions/restart.ts` (lines 1–280)

---

## Critical (must fix)

### `restart.ts:270–277` — Per-session guard state is shared, enabling repeat auto-handoff

**Root cause of repeated auto handoff in session `019f8f92-ffa8-7ab9-b083-ac7009bbbfaa`:**

The `lastSuppressedPct` variable (line 204) is a **module-level scalar** shared across all sessions managed by the same extension instance. The `session_start` handler (line 208) resets it to `null` every time **any** session starts:

```typescript
pi.on("session_start", () => { lastSuppressedPct = null; });
```

This creates a race-condition loop:

1. **Session A** `turn_end` fires → context ≥ 80% → user picks "Yes, handoff" → `lastSuppressedPct` set to 80 → `pi.sendMessage()` with `triggerTurn: true` is sent.
2. LLM processes → calls `handoff` tool.
3. `handoff` tool runs `ctx.newSession()` via `queueMicrotask` → **Session B starts** → `session_start` fires → **`lastSuppressedPct` is reset to `null` globally**.
4. Turn ends for Session A → `turn_end` fires again → `lastSuppressedPct === null` (reset by step 3) → guard check `pct < lastSuppressedPct + 5` is skipped → auto handoff prompts **again**.
5. User may see a second "Context at X% — handoff?" prompt in quick succession, or worse, the prompt appears after Session B was already created, creating duplicate handoffs.

**Why the existing `session_id` check doesn't save it:** The check on line 226 (`ctx.sessionManager.getSessionId() !== sessionBefore`) only guards against a session change **during the user's decision** (the `await ctx.ui.select(...)`). It does not protect against the session-start listener resetting the global state **between turn_end events**.

### `restart.ts:267–270` — `queueMicrotask` in handoff tool creates unreliable sequencing

```typescript
queueMicrotask(async () => {
    const result = await ctx.newSession({ parentSession: currentSessionFile });
    if (!result.cancelled && "ctx" in result && (result as any).ctx?.sendUserMessage) {
        await (result as any).ctx.sendUserMessage(params.prompt);
    }
});
```

Three problems:

- **Race with `turn_end`:** The microtask defers `ctx.newSession()` until after the tool returns and the current JS frame completes. But `turn_end` may fire synchronously after the tool result is persisted, before the microtask runs. This means the new session doesn't exist yet when `turn_end` fires, so no `session_start` reset has occurred — **however**, the `turn_end` after that will fire once the microtask *has* run and the guard state has been corrupted.

- **Type-unsafe access:** `(result as any).ctx?.sendUserMessage` suggests the API shape is uncertain. The `/restart` command handler (line 255) uses the typed `withSession` callback instead, which is the correct pattern.

- **No cancellation/error propagation:** Errors inside `queueMicrotask` are silently caught and logged to `console.error`, meaning the user gets no feedback if the handoff fails.

---

## Warnings (should fix)

### `restart.ts:238` — `display: false` hides the auto-handoff message from the user but not from context

The `pi.sendMessage` call uses `display: false`, meaning the user never sees the instruction to the LLM. This is intentional UX, but it means the user cannot verify or correct the instruction the LLM receives about generating the handoff prompt. Combined with the repeat-trigger bug, the LLM could receive multiple "handoff now" messages in the same session, potentially causing confused tool calls.

### `restart.ts:283` — `handoff` tool returns before the new session is usable

```typescript
return { content: [{ type: "text", text: "Handoff started." }] };
```

The tool reports success before `ctx.newSession()` has resolved. If the extension process crashes or the user interrupts between the return and the microtask execution, the current session shows "Handoff started." but no new session was created. The old session continues with corrupted expectations.

### `restart.ts:208` — `session_start` unconditionally clears `lastSuppressedPct`

Even for legitimate new sessions (not handoff-created), the guard state is cleared. This means if Session B (the child) reaches 80% context quickly, it won't benefit from the parent's suppression history. Minor, since each session should manage its own threshold independently, but the current code treats them as one.

---

## Suggestions (consider)

### `restart.ts:204` — Replace scalar with `Map<string, number>` keyed by session ID

The minimal reliable fix:

```typescript
// Instead of:
let lastSuppressedPct: number | null = null;

// Use:
const suppressedState = new Map<string, number>();

// In session_start:
pi.on("session_start", () => {
  suppressedState.clear(); // optional: only clear for fresh sessions, not handoff children
});

// In turn_end:
const sessionId = ctx.sessionManager.getSessionId();
const lastPct = suppressedState.get(sessionId) ?? null;
if (lastPct !== null && pct < lastPct + RE_PROMPT_INTERVAL) return;
suppressedState.set(sessionId, pct);
```

This ensures each session's suppression state is independent. A handoff child session does not corrupt the parent's guard state.

### `restart.ts:267` — Replace `queueMicrotask` with `ctx.newSession` `withSession` callback

The `/restart` command handler (line 255) correctly uses the typed `withSession` pattern:

```typescript
const newSessionResult = await ctx.newSession({
  parentSession: currentSessionFile,
  withSession: async (replacementCtx) => {
    await replacementCtx.sendUserMessage(finalPrompt);
  },
});
```

The `handoff` tool should do the same instead of `queueMicrotask` + raw `ctx.sendUserMessage` access:

```typescript
async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  if (!ctx.hasUI) return { content: [{ type: "text", text: "Handoff requires interactive mode." }] };
  const currentSessionFile = ctx.sessionManager.getSessionFile();
  await ctx.newSession({
    parentSession: currentSessionFile,
    withSession: async (replacementCtx) => {
      await replacementCtx.sendUserMessage(params.prompt);
    },
  });
  return { content: [{ type: "text", text: "Handoff started." }] };
},
```

This eliminates the microtask race entirely: `newSession` with `withSession` blocks until the new session is created and the message is sent, so when `turn_end` fires next, the session has already changed (or the state properly reflects the pending handoff).

### Add a `handoffPending: Set<string>` guard as belt-and-suspenders

Even with per-session `lastSuppressedPct`, a belt-and-suspenders guard prevents edge cases:

```typescript
const handoffPending = new Set<string>();

// In turn_end, before showing the prompt:
const sessionId = ctx.sessionManager.getSessionId();
if (handoffPending.has(sessionId)) return;

// In handoff tool execute, after newSession succeeds:
handoffPending.add(sessionId);

// Clear on session_end (or after a timeout):
pi.on("session_end", () => { handoffPending.delete(ctx.sessionManager.getSessionId()); });
```

---

## Summary

The repeated auto-handoff in session `019f8f92-ffa8-7ab9-b083-ac7009bbbfaa` is caused by a **shared mutable state bug**: the module-level `lastSuppressedPct` variable is reset to `null` by the `session_start` handler whenever the `handoff` tool creates a new session via `ctx.newSession()`. This clears the suppression guard for the **original session**, causing the `turn_end` handler to re-trigger the handoff prompt on the very next turn. The fix is to scope the suppression state per-session (e.g., `Map<string, number>`) and to replace the fragile `queueMicrotask` pattern in the `handoff` tool with the typed `withSession` callback that the `/restart` command already uses correctly.