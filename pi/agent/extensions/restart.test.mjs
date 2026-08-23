// Behavioral tests for restart.ts pure helpers. Run: node pi/agent/extensions/restart.test.mjs
import { register } from "node:module";

register(new URL("./pi-resolve-hook.mjs", import.meta.url), import.meta.url);

const { default: restart, extractHandoffText } = await import(new URL("./restart.ts", import.meta.url));
const { initTheme } = await import("@earendil-works/pi-coding-agent");
initTheme();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  extractHandoffText({
    stopReason: "stop",
    content: [
      { type: "thinking", text: "internal" },
      { type: "text", text: "  Context  " },
      { type: "text", text: "Task" },
    ],
  }) === "Context  \nTask",
  "joins and trims text blocks while ignoring thinking",
);
assert(
  extractHandoffText({ stopReason: "stop", content: [{ type: "text", text: "   " }] }) === null,
  "blank completion is rejected",
);
assert(
  extractHandoffText({ stopReason: "aborted", content: [{ type: "text", text: "partial" }] }) === null,
  "aborted completion remains cancellation",
);
assert(
  extractHandoffText({ stopReason: "stop", content: [{ type: "toolCall" }] }) === null,
  "non-text completion is rejected",
);

function makeHarness({ completion, selectChoice, editorText = "" } = {}) {
  const events = new Map();
  const commands = new Map();
  const shortcuts = new Map();
  const notifications = [];
  const completeOptions = [];
  const completeContexts = [];
  const sent = [];
  let selectCount = 0;
  let editor = editorText;

  const branch = [{
    id: "entry-1",
    type: "message",
    message: {
      role: "user",
      content: [{ type: "text", text: "Continue the task" }],
      timestamp: Date.now(),
    },
  }];
  const ctx = {
    mode: "tui",
    model: { provider: "test", id: "model" },
    isIdle: () => true,
    getContextUsage: () => ({ percent: 85 }),
    sessionManager: {
      getBranch: () => branch,
      getLeafId: () => "entry-1",
      getSessionFile: () => "/tmp/restart-session.jsonl",
      getSessionId: () => "restart-test",
    },
    modelRegistry: {
      complete: (_model, context, options) => {
        completeContexts.push(context);
        completeOptions.push(options);
        if (completion) return completion();
        return Promise.resolve({ stopReason: "stop", content: [{ type: "text", text: "## Task\nContinue" }] });
      },
    },
    ui: {
      notify: (message, type) => notifications.push({ message, type }),
      getEditorText: () => editor,
      setEditorText: (text) => { editor = text; },
      select: async () => {
        selectCount += 1;
        return selectChoice;
      },
      custom: async (factory) => {
        let component;
        const result = await new Promise((resolve) => {
          component = factory({ requestRender: () => {} }, { fg: (_color, text) => text }, {}, resolve);
        });
        component?.dispose?.();
        return result;
      },
    },
    newSession: async (options) => {
      await options.withSession({ sendUserMessage: async (message) => sent.push(message) });
      return { cancelled: false };
    },
  };

  const pi = {
    on: (name, handler) => events.set(name, handler),
    registerCommand: (name, definition) => commands.set(name, definition.handler),
    registerShortcut: (name, definition) => shortcuts.set(name, definition.handler),
  };
  restart(pi);
  return {
    ctx,
    commands,
    shortcuts,
    events,
    notifications,
    completeOptions,
    completeContexts,
    sent,
    getEditor: () => editor,
    getSelectCount: () => selectCount,
  };
}

{
  const h = makeHarness();
  await h.commands.get("restart")("keep going", h.ctx);
  assert(h.sent[0] === "## Task\nContinue", "generated handoff is sent to the replacement session");
  assert(h.completeOptions[0].signal instanceof AbortSignal, "completion receives cancellation signal");
  assert(!("apiKey" in h.completeOptions[0]), "completion uses registry-managed authentication");
  const handoffInput = h.completeContexts[0].messages[0].content[0].text;
  assert(handoffInput.includes("<conversation-history>"), "handoff history has an explicit boundary");
  assert(handoffInput.includes("<goal>\nkeep going\n</goal>"), "handoff goal has an explicit boundary");
}

{
  const h = makeHarness({ completion: async () => ({ stopReason: "stop", content: [] }) });
  await h.commands.get("restart")("", h.ctx);
  assert(h.notifications.at(-1)?.type === "error", "empty completion is reported as an error");
}

{
  const h = makeHarness({ completion: () => { throw new Error("sync failure"); } });
  await h.commands.get("restart")("", h.ctx);
  assert(h.notifications.at(-1)?.message.includes("sync failure"), "synchronous completion failure is reported");
}

{
  const h = makeHarness({ selectChoice: undefined });
  await h.events.get("turn_end")({}, h.ctx);
  await h.events.get("turn_end")({}, h.ctx);
  assert(h.getSelectCount() === 1, "dismissed guard does not reopen at the same percentage");
}

{
  const h = makeHarness();
  await h.shortcuts.get("ctrl+shift+r")(h.ctx);
  assert(h.getEditor() === "/restart", "shortcut prepares restart in an empty editor");
}

{
  const h = makeHarness({ editorText: "unfinished draft" });
  await h.shortcuts.get("ctrl+shift+r")(h.ctx);
  assert(h.getEditor() === "unfinished draft", "shortcut preserves an existing draft");
  assert(h.notifications.at(-1)?.type === "warning", "shortcut warns before preserving the draft");
}

console.log("restart helper and command tests passed");
