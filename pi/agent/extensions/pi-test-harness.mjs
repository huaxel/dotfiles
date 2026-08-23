// pi-test-harness.mjs — reusable hermetic test harness for Pi extensions.
//
// Consolidates the mock-API, fake-clock, assert, and temp-dir helpers that
// pi/agent/extensions tests were copy-pasting across go-on/restart/answer/
// todos/worksheet-loop.  Import whatever you need:
//
//   import { register } from "node:module";
//   register(new URL("./pi-resolve-hook.mjs", import.meta.url), import.meta.url);
//   import { makePiHarness, fakeClock, assert, tempDir, runTests } from "./pi-test-harness.mjs";
//   const h = makePiHarness();
//   installExtension(h.pi);
//   await h.drive("turn_end", {}, h.ctx);
//
// Run a standalone test: node pi/agent/extensions/my-extension.test.mjs

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── assertion + tiny runner ────────────────────────────────────────────────

export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Assert after an await; labels true cases to give output some shape. */
export const assertOk = (condition, label) => {
  if (!condition) {
    console.log("FAIL:", label);
    throw new Error(label);
  }
  console.log("ok:", label);
};

/**
 * Minimal sequential test runner.  Each test fn may be async; a thrown error
 * (from `assert`) fails that test, the rest still run.  Exit code is 1 if any
 * test failed.  Returns the pass/fail counts.
 */
export async function runTests(tests, { name = "tests" } = {}) {
  let passed = 0;
  const failures = [];
  for (const [label, fn] of Object.entries(tests)) {
    try {
      await fn();
      passed += 1;
      console.log(`  ok  ${label}`);
    } catch (err) {
      failures.push(label);
      console.log(`  FAIL ${label}\n${indent(err?.message ?? String(err))}`);
    }
  }
  console.log(`\n${name}: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
  return { passed, failed: failures.length };
}

function indent(text) {
  return text
    .split("\n")
    .map((line) => `       ${line}`)
    .join("\n");
}

// ── pi mock ────────────────────────────────────────────────────────────────

/**
 * Mock the ExtensionAPI surface.  `on`/`registerCommand`/`registerShortcut`/
 * `registerTool` record handlers keyed by name; `sendUserMessage`/`sendMessage`
 * append to `sent`.  Returns the fake pi plus maps and helpers to drive it.
 */
export function makePiHarness() {
  const handlers = new Map();
  const commands = new Map();
  const shortcuts = new Map();
  const tools = new Map();
  const sent = [];

  const pi = {
    on(event, fn) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
    registerCommand(name, def) {
      commands.set(name, def.handler);
    },
    registerShortcut(name, def) {
      shortcuts.set(name, def.handler);
    },
    registerTool(name, def) {
      tools.set(name, def);
    },
    registerFlag() {},
    getFlag() {},
    sendUserMessage: (content, options) => sent.push({ content, options }),
    sendMessage: (msg, options) => sent.push({ content: msg.content, options }),
  };

  return {
    pi,
    handlers,
    commands,
    shortcuts,
    tools,
    sent,
    /** Run all registered handlers for an event in order with (event, ctx). */
    async drive(event, ev, ctx) {
      let out = [];
      for (const fn of handlers.get(event) ?? []) {
        const r = await fn(ev, ctx);
        if (r !== undefined) out.push(r);
      }
      return out;
    },
    /** Invoke a command handler with args + ctx, returning its value. */
    async runCommand(name, args, ctx) {
      const handler = commands.get(name);
      if (!handler) throw new Error(`no command registered: ${name}`);
      return handler(args, ctx);
    },
    /** Invoke a shortcut handler with ctx. */
    async runShortcut(name, ctx) {
      const handler = shortcuts.get(name);
      if (!handler) throw new Error(`no shortcut registered: ${name}`);
      return handler(ctx);
    },
  };
}

/**
 * Build a minimal ExtensionCommandContext with a stubbed UI.  Common defaults:
 * idle, a trivial sessionManager (getSessionId), a notify/input/select that no-
 * op/return sensible values.  Override anything via `overrides`.
 */
export function makeCtx(overrides = {}) {
  const notifications = [];
  const ctx = {
    mode: "tui",
    isIdle: () => true,
    hasUI: true,
    model: { provider: "test", id: "test-model" },
    sessionManager: {
      getSessionId: () => "test-session",
      getSessionFile: () => "/tmp/test-session.jsonl",
      getBranch: () => [],
      getLeafId: () => null,
    },
    modelRegistry: {
      complete: async () => ({ stopReason: "stop", content: [{ type: "text", text: "" }] }),
      getApiKeyAndHeaders: async () => ({ ok: true }),
    },
    ui: {
      notify: (message, type) => notifications.push({ message, type }),
      confirm: async () => true,
      input: async () => undefined,
      select: async () => undefined,
      setStatus: () => {},
      getEditorText: () => "",
      setEditorText: () => {},
    },
    newSession: async (opts) => {
      if (opts?.withSession) await opts.withSession({ sendUserMessage: async () => {} });
      return { cancelled: false };
    },
    ...overrides,
  };
  (ctx.ui.notifications = notifications);
  return ctx;
}

// ── temp dir ───────────────────────────────────────────────────────────────

/**
 * Create a temp directory unique to this test process and return a cleanup
 * function that removes it.  `prefix` is used to name the dir.
 */
export function tempDir(prefix = "pi-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ── fake clock ─────────────────────────────────────────────────────────────

/**
 * Injectable fake clock for extensions that schedule timers.  Wiring must not
 * schedule real timers or node:test never exits; inject instead the
 * `setTimer`/`clearTimer`/`now` returned here and control time with `advance`.
 * Pass a fixed `base` for drift-free unit tests, or default to Date.now().
 */
export function fakeClock(base = Date.now()) {
  let offset = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => base + offset,
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: base + offset + ms, fn });
      return id;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    /** Advance the clock, firing any timers that come due, in due order. */
    advance(ms) {
      offset += ms;
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= base + offset)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of due) {
        timers.delete(id);
        t.fn();
      }
    },
    pendingCount: () => timers.size,
  };
}

// ── ESM import helper ──────────────────────────────────────────────────────

/**
 * Run `register(pi-resolve-hook)` then import a `.ts` extension's named exports
 * and default together.  Returns { default, ...named }.  Extensions that
 * reference `__dirname`/`process.cwd()` at module scope may need the
 * todos-style real loader instead; prefer this when the module exports pure
 * helpers and only touches those at import time.
 */
export async function importExtension(fileUrl, exportNames = []) {
  const mod = await import(fileUrl);
  const out = { default: mod.default };
  for (const name of exportNames) {
    if (name in mod) out[name] = mod[name];
  }
  return out;
}

// Re-export a resolve-hook registration helper so callers can register the
// hook and import @earendil-works/* modules without repeating the two-line
// `register(new URL(...), import.meta.url)` idiom.  The `node:` specifier
// itself needs no hook.
export async function registerResolveHook(hookUrl = "./pi-resolve-hook.mjs") {
  const { register } = await import("node:module");
  register(new URL(hookUrl, import.meta.url), import.meta.url);
}
