// Shared hermetic test harness for the pi-multi-opencode-go extension.
// Stubs the pi API and global fetch; redirects agent dir (log/state) to a
// temp directory via PI_CODING_AGENT_DIR.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import installExtension, {
  type ResumeSchedulerDeps,
} from "../index.ts";
import { PROVIDER } from "../lib/constants.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Same shape the official OpenCode Go usage API returns.
const FIXTURE_USAGE = {
  usage: {
    rolling: { status: "ok", percent: 42.5, resetsAt: new Date(Date.now() + 3600_000).toISOString() },
    weekly: { status: "ok", percent: 10, resetsAt: new Date(Date.now() + 86_400_000).toISOString() },
    monthly: { status: "ok", percent: 5, resetsAt: new Date(Date.now() + 2_592_000_000).toISOString() },
  },
};

export interface SentMessage {
  content: unknown;
  options?: unknown;
}

export interface FakePi {
  pi: ExtensionAPI;
  handlers: Map<
    string,
    Array<(event: unknown, ctx: unknown) => Promise<void> | void>
  >;
  commands: Map<
    string,
    { handler: (args: string, ctx: unknown) => Promise<void> | void }
  >;
  tools: Map<string, unknown>;
  sent: SentMessage[];
}

export function makeFakePi(): FakePi {
  const handlers: FakePi["handlers"] = new Map();
  const commands: FakePi["commands"] = new Map();
  const tools: FakePi["tools"] = new Map();
  const sent: SentMessage[] = [];
  const pi = {
    on(
      event: string,
      fn: (event: unknown, ctx: unknown) => Promise<void> | void,
    ) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
    registerCommand(
      name: string,
      def: { handler: (args: string, ctx: unknown) => Promise<void> | void },
    ) {
      commands.set(name, def);
    },
    registerTool(name: string, def: unknown) {
      tools.set(name, def);
    },
    async sendUserMessage(content: unknown, options?: unknown) {
      sent.push({ content, options });
    },
  } as unknown as ExtensionAPI;
  return { pi, handlers, commands, tools, sent };
}

export function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    model: { provider: PROVIDER },
    isIdle: () => true,
    ui: { notify: () => {} },
    cwd: process.cwd(),
    ...overrides,
  };
}

export function makeFetchStub() {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/zen/go/v1/usage")) {
      return {
        ok: true,
        status: 200,
        json: async () => FIXTURE_USAGE,
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

export async function drive(
  handlers: FakePi["handlers"],
  event: string,
  ev: unknown,
  ctx: unknown,
) {
  for (const fn of handlers.get(event) ?? []) {
    await fn(ev, ctx);
  }
}

export interface TestEnv {
  tmpAgentDir: string;
  cleanup: () => Promise<void>;
}

/** Set env accounts + fetch stub + temp agent dir; returns cleanup. */
export async function setupEnv(): Promise<TestEnv> {
  const tmpAgentDir = await mkdtemp(join(tmpdir(), "opencode-go-test-"));
  const keys = [
    "PI_CODING_AGENT_DIR",
    "OPENCODE_API_KEY_1",
    "OPENCODE_API_KEY_2",
    "OPENCODE_GO_WORKSPACE_ID_1",
    "OPENCODE_GO_WORKSPACE_ID_2",
    "OPENCODE_GO_AUTH_COOKIE_1",
    "OPENCODE_GO_AUTH_COOKIE_2",
    "OPENCODE_GO_LABEL_1",
    "OPENCODE_GO_LABEL_2",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) saved[key] = process.env[key];

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

  return {
    tmpAgentDir,
    cleanup: async () => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete (globalThis as Record<string, unknown>).fetch;
      await rm(tmpAgentDir, { recursive: true, force: true });
    },
  };
}

/** Install the extension against a fresh stub and drive session_start. */
export async function bootExtension(
  tmpAgentDir: string,
  deps: ResumeSchedulerDeps = {},
) {  // Isolate per-test state: persisted cooldowns and coordination globals
  // must not leak between tests (node:test shares the process).
  const g = globalThis as Record<string, unknown>;
  delete g.__opencode_go_all_exhausted;
  delete g.__opencode_go_has_fallback;
  delete g.__opencode_go_earliest_reset;
  delete g.__opencode_go_active_label;
  await rm(join(tmpAgentDir, "opencode-go-failover-state.json"), {
    force: true,
  });

  const fake = makeFakePi();
  installExtension(fake.pi, deps);
  const ctx = makeCtx();
  await drive(fake.handlers, "session_start", {}, ctx);
  return { ...fake, ctx };
}

/** Boot with a fake clock injected — no real timers may be scheduled in
 * tests, or the process never exits (node:test waits on the event loop). */
export async function bootWithClock(tmpAgentDir: string) {
  const clock = makeFakeClock();
  const result = await bootExtension(tmpAgentDir, {
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { ...result, clock };
}

export interface FakeClock {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Advance the clock, firing any due timers. */
  advance: (ms: number) => void;
  pendingCount: () => number;
}

/** Fake clock. Base defaults to Date.now() (extension wiring tests need real
 * timestamps from markExhausted); pass a fixed base for pure unit tests so
 * delays are exact and drift-free. */
export function makeFakeClock(base: number = Date.now()): FakeClock {
  let offset = 0;
  let nextId = 1;
  const timers = new Map<
    number,
    { at: number; fn: () => void }
  >();
  return {
    now: () => base + offset,
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: base + offset + ms, fn });
      return id;
    },
    clearTimer(handle) {
      timers.delete(handle as number);
    },
    advance(ms) {
      offset += ms;
      const due = [...timers.entries()].filter(([, t]) => t.at <= base + offset);
      for (const [id, t] of due) {
        timers.delete(id);
        t.fn();
      }
    },
    pendingCount: () => timers.size,
  };
}
