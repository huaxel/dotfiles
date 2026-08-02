// Hermetic wiring test for the auto-continue-after-account-switch feature.
//
// Drives the extension's real event handlers (session_start, turn_start,
// before_provider_headers, after_provider_response, message_end,
// agent_settled) against a stub `pi` API and a stubbed global fetch, so no
// network, no real auth.json, and no real pi/agent log writes occur
// (PI_CODING_AGENT_DIR points at a temp dir).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import installExtension from "../index.ts";
import { AUTO_CONTINUE_PROMPT, PROVIDER } from "../lib/constants.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Same dashboard HTML shape the opencode-go-usage parser expects.
const FIXTURE_HTML = `
rollingUsage:$R[0]={usagePercent:42.5,resetInSec:3600}
weeklyUsage:$R[1]={resetInSec:86400,usagePercent:10}
monthlyUsage:$R[2]={usagePercent:5,resetInSec:2592000}
`;

interface SentMessage {
  content: unknown;
  options?: unknown;
}

function makeFakePi() {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<void> | void>>();
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> | void }>();
  const sent: SentMessage[] = [];
  const pi = {
    on(event: string, fn: (event: unknown, ctx: unknown) => Promise<void> | void) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
    registerCommand(name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> | void }) {
      commands.set(name, def);
    },
    async sendUserMessage(content: unknown, options?: unknown) {
      sent.push({ content, options });
    },
  };
  return { pi, handlers, commands, sent };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    model: { provider: PROVIDER },
    isIdle: () => true,
    ui: { notify: () => {} },
    cwd: process.cwd(),
    ...overrides,
  };
}

function makeFetchStub() {
  return async (input: string | URL | Request) => {
    const url = String(input);
    const match = /workspace\/([^/]+)\/go/.exec(url);
    const workspaceId = match?.[1] ?? "unknown";
    return {
      ok: true,
      status: 200,
      url: `https://opencode.ai/workspace/${workspaceId}/go`,
      text: async () => FIXTURE_HTML,
    };
  };
}

async function drive(
  handlers: Map<string, Array<(event: unknown, ctx: unknown) => Promise<void> | void>>,
  event: string,
  ev: unknown,
  ctx: unknown,
) {
  for (const fn of handlers.get(event) ?? []) {
    await fn(ev, ctx);
  }
}

let tmpAgentDir: string;
let savedEnv: Record<string, string | undefined>;

before(async () => {
  tmpAgentDir = await mkdtemp(join(tmpdir(), "opencode-go-test-"));
  savedEnv = {};
  const keys = [
    "PI_CODING_AGENT_DIR",
    "OPENCODE_API_KEY_1", "OPENCODE_API_KEY_2",
    "OPENCODE_GO_WORKSPACE_ID_1", "OPENCODE_GO_WORKSPACE_ID_2",
    "OPENCODE_GO_AUTH_COOKIE_1", "OPENCODE_GO_AUTH_COOKIE_2",
    "OPENCODE_GO_LABEL_1", "OPENCODE_GO_LABEL_2",
  ];
  for (const key of keys) {
    savedEnv[key] = process.env[key];
  }
  process.env.PI_CODING_AGENT_DIR = tmpAgentDir;
  process.env.OPENCODE_API_KEY_1 = "key-sub-1";
  process.env.OPENCODE_API_KEY_2 = "key-sub-2";
  process.env.OPENCODE_GO_WORKSPACE_ID_1 = "ws-sub-1";
  process.env.OPENCODE_GO_WORKSPACE_ID_2 = "ws-sub-2";
  process.env.OPENCODE_GO_AUTH_COOKIE_1 = "cookie-sub-1";
  process.env.OPENCODE_GO_AUTH_COOKIE_2 = "cookie-sub-2";
  process.env.OPENCODE_GO_LABEL_1 = "sub-1";
  process.env.OPENCODE_GO_LABEL_2 = "sub-2";
  (globalThis as Record<string, unknown>).fetch = makeFetchStub();
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete (globalThis as Record<string, unknown>).fetch;
  await rm(tmpAgentDir, { recursive: true, force: true });
});

async function boot() {
  // Isolate per-test state: persisted cooldowns and coordination globals
  // must not leak between tests (node:test shares the process).
  const g = globalThis as Record<string, unknown>;
  delete g.__opencode_go_all_exhausted;
  delete g.__opencode_go_has_fallback;
  delete g.__opencode_go_active_label;
  await rm(join(tmpAgentDir, "opencode-go-failover-state.json"), {
    force: true,
  });

  const { pi, handlers, commands, sent } = makeFakePi();
  installExtension(pi as unknown as ExtensionAPI);
  const ctx = makeCtx();
  await drive(handlers, "session_start", {}, ctx);
  return { pi, handlers, commands, sent, ctx };
}

test("quota error at message_end switches account and auto-continues exactly once", async () => {
  const { handlers, sent, ctx } = await boot();
  assert.equal(handlers.get("agent_settled")?.length, 1, "agent_settled handler registered");

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
  const { handlers, sent, ctx } = await boot();

  const headersEvent = { headers: {} as Record<string, string> };
  await drive(handlers, "before_provider_headers", headersEvent, ctx);

  await drive(handlers, "after_provider_response", { status: 429 }, ctx);
  await drive(handlers, "agent_settled", {}, ctx);
  assert.equal(sent.length, 1, "429 path queues the retry");
});

test("auto-continue skipped when all accounts are exhausted (no loop)", async () => {
  const { handlers, sent, ctx } = await boot();

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
  const { handlers, sent, ctx } = await boot();

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
  const { handlers, commands, sent, ctx } = await boot();
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
