// Behavioral tests for continue-after-compaction.ts.
import { registerHooks } from "node:module";
import { resolve } from "./pi-resolve-hook.mjs";
import { assert, fakeClock, makeCtx, makePiHarness, runTests } from "./pi-test-harness.mjs";

registerHooks({ resolve });

const {
  buildContinuationPrompt,
  default: continueAfterCompaction,
  installContinueAfterCompaction,
  shouldContinueAfterCompaction,
} = await import(new URL("./continue-after-compaction.ts", import.meta.url));

function compactionEvent(reason, willRetry = false, id = "compaction-1") {
  return {
    reason,
    willRetry,
    compactionEntry: { id },
  };
}

function makeTestContext(sessionId = "continuation-test") {
  return makeCtx({
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => "/tmp/continuation-session.jsonl",
    },
  });
}

await runTests(
  {
    "only threshold compaction without native retry continues": async () => {
      assert(shouldContinueAfterCompaction({ reason: "threshold", willRetry: false }), "threshold compaction continues");
      assert(!shouldContinueAfterCompaction({ reason: "manual", willRetry: false }), "manual compaction does not continue");
      assert(!shouldContinueAfterCompaction({ reason: "overflow", willRetry: true }), "native overflow retry does not continue");
      assert(!shouldContinueAfterCompaction({ reason: "overflow", willRetry: false }), "completed overflow does not continue");
    },
    "threshold compaction sends one deferred continuation": async () => {
      const clock = fakeClock();
      const harness = makePiHarness();
      const ctx = makeTestContext();
      installContinueAfterCompaction(harness.pi, { setTimeout: clock.setTimer, clearTimeout: clock.clearTimer });

      await harness.drive("session_compact", compactionEvent("threshold"), ctx);
      assert(harness.sent.length === 0, "continuation is deferred");
      assert(clock.pendingCount() === 1, "one continuation timer is pending");

      clock.advance(0);
      assert(harness.sent.length === 1, "continuation is sent after the timer");
      assert(harness.sent[0].options.deliverAs === "steer", "continuation is steering input");
      assert(harness.sent[0].content.includes("/tmp/continuation-session.jsonl"), "session file is included");
      assert(harness.sent[0].content.includes("compaction-1"), "compaction entry is included");
      assert(clock.pendingCount() === 0, "timer is cleared after firing");
    },
    "manual and overflow compaction do not schedule work": async () => {
      const clock = fakeClock();
      const harness = makePiHarness();
      const ctx = makeTestContext();
      installContinueAfterCompaction(harness.pi, { setTimeout: clock.setTimer, clearTimeout: clock.clearTimer });

      await harness.drive("session_compact", compactionEvent("manual"), ctx);
      await harness.drive("session_compact", compactionEvent("overflow", true), ctx);
      assert(harness.sent.length === 0, "excluded compactions send nothing");
      assert(clock.pendingCount() === 0, "excluded compactions schedule nothing");
    },
    "duplicate events schedule only one continuation": async () => {
      const clock = fakeClock();
      const harness = makePiHarness();
      const ctx = makeTestContext();
      installContinueAfterCompaction(harness.pi, { setTimeout: clock.setTimer, clearTimeout: clock.clearTimer });

      await harness.drive("session_compact", compactionEvent("threshold", false, "first"), ctx);
      await harness.drive("session_compact", compactionEvent("threshold", false, "second"), ctx);
      assert(clock.pendingCount() === 1, "duplicate event is coalesced");
      clock.advance(0);
      assert(harness.sent.length === 1, "only one continuation is sent");
      assert(harness.sent[0].content.includes("first"), "first compaction remains authoritative");
    },
    "shutdown cancels pending continuation": async () => {
      const clock = fakeClock();
      const harness = makePiHarness();
      const ctx = makeTestContext();
      installContinueAfterCompaction(harness.pi, { setTimeout: clock.setTimer, clearTimeout: clock.clearTimer });

      await harness.drive("session_compact", compactionEvent("threshold"), ctx);
      await harness.drive("session_shutdown", {}, ctx);
      clock.advance(0);
      assert(harness.sent.length === 0, "shutdown prevents stale continuation");
      assert(clock.pendingCount() === 0, "shutdown clears the timer");
    },
    "prompt handles ephemeral sessions": async () => {
      const prompt = buildContinuationPrompt(undefined, "compaction-ephemeral");
      assert(prompt.includes("session is ephemeral"), "ephemeral state is disclosed");
      assert(prompt.includes("compaction-ephemeral"), "entry id remains available");
    },
  },
  { name: "continue-after-compaction tests" },
);
