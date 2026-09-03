// Self-test for pi-test-harness.mjs helpers (fakeClock, tempDir, runTests,
// makeCtx, registerResolveHook). Run: node pi/agent/extensions/harness.test.mjs
import { registerHooks } from "node:module";
import { resolve } from "./pi-resolve-hook.mjs";
import * as fs from "node:fs";
import * as path from "node:path";

registerHooks({ resolve });
const {
  fakeClock,
  tempDir,
  runTests,
  makeCtx,
  makePiHarness,
  assert,
} = await import("./pi-test-harness.mjs");

await runTests(
  {
    "fakeClock fires due timers and sorts by due time": async () => {
      const clock = fakeClock(1000);
      const fired = [];
      clock.setTimer(() => fired.push("t2"), 20);
      clock.setTimer(() => fired.push("t1"), 10);
      assert(clock.pendingCount() === 2, "two timers pending");
      clock.advance(15);
      assert(fired.length === 1 && fired[0] === "t1", "first timer fired at its due time");
      clock.advance(10);
      assert(fired.length === 2 && fired[1] === "t2", "second timer fired after further advance");
      assert(clock.pendingCount() === 0, "no timers left");
      assert(clock.now() === 1025, "clock base + offset");
    },
    "fakeClock.clearTimer cancels": async () => {
      const clock = fakeClock();
      const h = clock.setTimer(() => {}, 100);
      clock.clearTimer(h);
      clock.advance(200);
      assert(clock.pendingCount() === 0, "cancelled timer never fires");
    },
    "tempDir creates and cleans up": async () => {
      const { dir, cleanup } = tempDir("harness-self-");
      assert(fs.existsSync(dir), "temp dir created");
      fs.writeFileSync(path.join(dir, "x.txt"), "hi");
      cleanup();
      assert(!fs.existsSync(dir), "temp dir removed by cleanup");
    },
    "makeCtx defaults are usable and overridable": async () => {
      const ctx = makeCtx();
      assert(ctx.isIdle() === true, "default idle");
      assert(ctx.mode === "tui", "default mode");
      assert(ctx.sessionManager.getSessionId() === "test-session", "default session id");
      assert(Array.isArray(ctx.ui.notifications), "notifications array exposed");
      ctx.ui.notify("hi", "info");
      assert(ctx.ui.notifications.length === 1, "notify recorded");
      const overridden = makeCtx({ isIdle: () => false, mode: "print" });
      assert(overridden.isIdle() === false && overridden.mode === "print", "overrides applied");
    },
    "makePiHarness records handlers and drives events": async () => {
      const h = makePiHarness();
      h.pi.on("turn_end", (_e, ctx) => ({ seen: ctx?.mode }));
      const results = await h.drive("turn_end", {}, makeCtx());
      assert(results.length === 1 && results[0].seen === "tui", "drive returns handler results");
      h.pi.registerCommand("foo", { handler: async (a, c) => `${a}:${c.mode}` });
      assert((await h.runCommand("foo", "hi", makeCtx())) === "hi:tui", "runCommand works");
      h.pi.registerShortcut("ctrl+x", { handler: async (c) => `shortcut:${c.mode}` });
      assert((await h.runShortcut("ctrl+x", makeCtx())) === "shortcut:tui", "runShortcut works");
      h.pi.sendUserMessage("hello", { deliverAs: "steer" });
      assert(h.sent.length === 1 && h.sent[0].content === "hello", "sent recorded");
    },
    "assertOk labels and runTests reports failures": async () => {
      const result = await runTests(
        {
          pass: async () => {},
          fail: async () => {
            throw new Error("boom");
          },
        },
        { name: "self-check" },
      );
      assert(result.passed === 1 && result.failed === 1, "runner counts pass and fail");
      // The failing test set process.exitCode; clear it for the final pass.
      process.exitCode = 0;
    },
  },
  { name: "harness self-tests" },
);
