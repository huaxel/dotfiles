// Hermetic wiring test for the auto-continue-after-account-switch feature.
//
// Drives the extension's real event handlers (session_start, turn_start,
// before_provider_headers, after_provider_response, message_end,
// agent_settled) against a stub `pi` API and a stubbed global fetch, so no
// network, no real auth.json, and no real pi/agent log writes occur
// (PI_CODING_AGENT_DIR points at a temp dir).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { AUTO_CONTINUE_PROMPT } from "../lib/constants.ts";
import {
  bootWithClock,
  drive,
  makeCtx,
  setupEnv,
  type TestEnv,
} from "./harness.ts";

let env: TestEnv;

before(async () => {
  env = await setupEnv();
});

after(async () => {
  await env.cleanup();
});

test("quota error at message_end switches account and auto-continues exactly once", async () => {
  const { handlers, sent, ctx } = await bootWithClock(env.tmpAgentDir);
  assert.equal(
    handlers.get("agent_settled")?.length,
    1,
    "agent_settled handler registered",
  );

  await drive(handlers, "turn_start", { turnIndex: 1 }, ctx);

  const headersEvent = { headers: {} as Record<string, string> };
  await drive(handlers, "before_provider_headers", headersEvent, ctx);
  assert.match(headersEvent.headers.Authorization ?? "", /^Bearer /);

  await drive(
    handlers,
    "message_end",
    {
      message: {
        role: "assistant",
        stopReason: "error",
        errorMessage: "quota exceeded: monthly usage limit reached",
      },
    },
    ctx,
  );

  await drive(handlers, "agent_settled", {}, ctx);
  assert.equal(sent.length, 1, "exactly one auto-continue queued");
  assert.equal(sent[0]!.content, AUTO_CONTINUE_PROMPT);
  assert.deepEqual(sent[0]!.options, { deliverAs: "followUp" });

  // A second settled event (retry turn completing normally) must not re-fire.
  await drive(handlers, "turn_start", { turnIndex: 2 }, ctx);
  await drive(handlers, "agent_settled", {}, ctx);
  assert.equal(sent.length, 1, "flag consumed — no double fire");
});

test("HTTP 429 at after_provider_response also arms the auto-continue", async () => {
  const { handlers, sent, ctx } = await bootWithClock(env.tmpAgentDir);

  const headersEvent = { headers: {} as Record<string, string> };
  await drive(handlers, "before_provider_headers", headersEvent, ctx);

  await drive(handlers, "after_provider_response", { status: 429 }, ctx);
  await drive(handlers, "agent_settled", {}, ctx);
  assert.equal(sent.length, 1, "429 path queues the retry");
});

test("auto-continue skipped when all accounts are exhausted (no loop)", async () => {
  const { handlers, sent, ctx } = await bootWithClock(env.tmpAgentDir);

  // First error exhausts sub-1 and switches to sub-2.
  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
    ctx,
  );
  // Second error exhausts sub-2 → every account on cooldown.
  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "quota exceeded" } },
    ctx,
  );
  const g = globalThis as Record<string, unknown>;
  assert.equal(g.__opencode_go_all_exhausted, true, "coordination flag flipped");

  await drive(handlers, "agent_settled", {}, ctx);
  assert.equal(sent.length, 0, "no retry when no alternate account exists");
});

test("non-quota errors do not arm the auto-continue", async () => {
  const { handlers, sent, ctx } = await bootWithClock(env.tmpAgentDir);

  await drive(
    handlers,
    "message_end",
    { message: { role: "assistant", stopReason: "error", errorMessage: "unexpected EOF" } },
    ctx,
  );
  await drive(handlers, "agent_settled", {}, ctx);
  assert.equal(sent.length, 0, "unrelated errors must not trigger a retry turn");
});

test("debug command arms the flag and reports status", async () => {
  const { handlers, commands, sent, ctx } = await bootWithClock(env.tmpAgentDir);
  const cmd = commands.get("opencode-autocontinue-test");
  assert.ok(cmd, "debug command registered");

  const notifications: string[] = [];
  const notifyCtx = makeCtx({ ui: { notify: (m: string) => notifications.push(m) } });

  await cmd!.handler("", notifyCtx);
  await drive(handlers, "agent_settled", {}, notifyCtx);
  assert.equal(sent.length, 1, "armed flag fires on next settled");

  await cmd!.handler("status", notifyCtx);
  assert.match(notifications.at(-1) ?? "", /enabled=true pending=false/);
});
