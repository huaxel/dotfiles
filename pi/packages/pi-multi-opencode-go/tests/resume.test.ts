// Tests for the overnight-resume feature: when ALL accounts are on cooldown,
// the extension schedules one retry for the earliest reset and fires it via
// a queued user message. Unit tests cover the scheduler state machine; wiring
// tests drive the extension's real handlers with an injected fake clock.
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import {
  computeEarliestReset,
  createResumeScheduler,
} from "../lib/resume.ts";
import { RESUME_PROMPT } from "../lib/constants.ts";
import type { AccountUsage } from "../lib/types.ts";
import {
  bootWithClock,
  drive,
  makeFakeClock,
  makeCtx,
  setupEnv,
  type FakeClock,
  type TestEnv,
} from "./harness.ts";

let env: TestEnv;

before(async () => {
  env = await setupEnv();
});

after(async () => {
  await env.cleanup();
});

function usage(label: string, exhaustedUntil?: number): AccountUsage {
  return {
    account: { key: `k-${label}`, workspaceId: `ws-${label}`, authCookie: `c-${label}`, label },
    rolling: null,
    weekly: null,
    monthly: null,
    fetchedAt: Date.now(),
    ...(exhaustedUntil !== undefined ? { exhaustedUntil } : {}),
  };
}

function makeScheduler(clock: FakeClock, onFire: () => void) {
  return createResumeScheduler({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onFire,
  });
}

// ── Unit: computeEarliestReset ────────────────────────────────────────────

test("computeEarliestReset returns the minimum future exhaustedUntil", () => {
  const now = 1_000_000;
  const usages = [
    usage("a", now + 3_600_000),
    usage("b", now + 86_400_000),
    usage("c"), // no cooldown
  ];
  assert.equal(computeEarliestReset(usages, now), now + 3_600_000);
});

test("computeEarliestReset ignores past/absent cooldowns and returns null when none", () => {
  const now = 1_000_000;
  assert.equal(
    computeEarliestReset([usage("a", now - 1), usage("b")], now),
    null,
  );
  assert.equal(computeEarliestReset([], now), null);
});

// ── Unit: scheduler state machine ─────────────────────────────────────────

test("scheduler arms once, fires exactly once, and ignores re-arm while fired", () => {
  // Fixed base: pure fake time, so delay/remaining math is exact.
  const clock = makeFakeClock(1_000_000);
  let fired = 0;
  const s = makeScheduler(clock, () => fired++);

  assert.equal(s.state, "idle");
  s.arm(clock.now() + 10_000);
  assert.equal(s.state, "armed");
  assert.equal(s.remainingMs(), 10_000);

  s.arm(clock.now() + 5_000); // re-arm while armed → no-op
  assert.equal(s.remainingMs(), 10_000, "re-arm while armed is ignored");

  clock.advance(10_000);
  assert.equal(fired, 1);
  assert.equal(s.state, "fired");

  s.arm(clock.now() + 1_000); // re-arm while fired → no-op
  clock.advance(10_000);
  assert.equal(fired, 1, "no second fire after fired");
});

test("scheduler reset() cancels the pending timer and allows re-arming", () => {
  const clock = makeFakeClock(1_000_000);
  let fired = 0;
  const s = makeScheduler(clock, () => fired++);

  s.arm(clock.now() + 10_000);
  assert.equal(clock.pendingCount(), 1);
  s.reset();
  assert.equal(s.state, "idle");
  assert.equal(clock.pendingCount(), 0, "timer cancelled");

  clock.advance(60_000);
  assert.equal(fired, 0);

  s.arm(clock.now() + 1_000);
  clock.advance(1_000);
  assert.equal(fired, 1, "new cycle can re-arm");
});

// ── Wiring: extension end-to-end with fake clock ──────────────────────────

test("all-exhausted arms the resume timer; reset arrival queues one retry prompt", async () => {
  const { handlers, sent, ctx, clock } = await bootWithClock(env.tmpAgentDir);

  // Exhaust sub-1 then sub-2 → every account on cooldown → scheduler arms.
  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
    ctx,
  );
  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
    ctx,
  );
  assert.equal(clock.pendingCount(), 1, "resume timer armed");

  const earliest = (globalThis as Record<string, unknown>)
    .__opencode_go_earliest_reset as number | undefined;
  assert.ok(typeof earliest === "number", "earliest_reset coordination flag set");

  // Wait out the cooldown (8 days covers any cooldown window) → fires once.
  clock.advance(8 * 24 * 60 * 60 * 1000);
  assert.equal(sent.length, 1, "one auto-resume queued");
  assert.equal(sent[0]!.content, RESUME_PROMPT);
  assert.deepEqual(sent[0]!.options, { deliverAs: "followUp" });

  // Nothing pending afterwards — no repeat fire.
  assert.equal(clock.pendingCount(), 0);
  clock.advance(8 * 24 * 60 * 60 * 1000);
  assert.equal(sent.length, 1);
});

test("after firing, once cooldowns clear the scheduler resets and a new cycle re-arms", async () => {
  const { handlers, sent, ctx, clock } = await bootWithClock(env.tmpAgentDir);

  const exhaustAll = async () => {
    await drive(
      handlers,
      "message_end",
      { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
      ctx,
    );
    await drive(
      handlers,
      "message_end",
      { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
      ctx,
    );
  };

  await exhaustAll();
  assert.equal(clock.pendingCount(), 1);

  // First cycle fires after the earliest reset passes.
  clock.advance(8 * 24 * 60 * 60 * 1000);
  assert.equal(sent.length, 1, "first cycle fired");

  // Cooldowns clear (reset window passed / /opencode-failover reset) and a
  // refresh then sees healthy accounts → scheduler resets to idle.
  await rm(join(env.tmpAgentDir, "opencode-go-failover-state.json"), {
    force: true,
  });
  const headersEvent = { headers: {} as Record<string, string> };
  await drive(handlers, "before_provider_headers", headersEvent, ctx);
  assert.equal(clock.pendingCount(), 0, "scheduler reset after recovery");

  // A later exhaustion cycle re-arms and fires again.
  await exhaustAll();
  assert.equal(clock.pendingCount(), 1, "second cycle re-armed");
  clock.advance(8 * 24 * 60 * 60 * 1000);
  assert.equal(sent.length, 2, "second cycle fired");
});

test("/opencode-failover reset clears an armed resume timer", async () => {
  const { handlers, commands, sent, ctx, clock } = await bootWithClock(
    env.tmpAgentDir,
  );

  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
    ctx,
  );
  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
    ctx,
  );
  assert.equal(clock.pendingCount(), 1, "armed");

  const cmd = commands.get("opencode-failover");
  assert.ok(cmd);
  await cmd!.handler("reset", makeCtx());
  assert.equal(clock.pendingCount(), 0, "cooldown reset cancelled the timer");

  clock.advance(8 * 24 * 60 * 60 * 1000);
  assert.equal(sent.length, 0, "no resume after manual reset");
});
