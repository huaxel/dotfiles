import goOn from "./go-on.ts";

function makeHarness({ model = {}, auth = { ok: true } } = {}) {
  const events = new Map();
  const shortcuts = new Map();
  const commands = new Map();
  const sent = [];
  const statuses = [];
  const notifications = [];
  let branch = [];
  let idle = true;
  const pi = {
    sendUserMessage: (...args) => sent.push(args),
    on: (name, handler) => events.set(name, handler),
    registerShortcut: (name, options) => shortcuts.set(name, options.handler),
    registerCommand: (name, options) => commands.set(name, options.handler),
  };
  const ctx = {
    isIdle: () => idle,
    model,
    modelRegistry: { getApiKeyAndHeaders: async () => auth },
    sessionManager: { getBranch: () => branch },
    ui: {
      setStatus: (key, value) => statuses.push([key, value]),
      notify: (message, type) => notifications.push([message, type]),
    },
  };
  goOn(pi);
  return { events, shortcuts, commands, sent, statuses, notifications, ctx, setBranch: (value) => { branch = value; }, setIdle: (value) => { idle = value; } };
}

const assistant = (text, stopReason = "stop") => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text }], stopReason } });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Plain toggle arms without sending an initial message; combined shortcut sends one.
{
  const h = makeHarness();
  await h.commands.get("go-on-mode")("on", h.ctx);
  assert(h.sent.length === 0, "toggle unexpectedly sent an initial nudge");
  await h.shortcuts.get("alt+shift+enter")(h.ctx);
}

// Completion is honored even after tool work.
{
  const h = makeHarness();
  await h.shortcuts.get("alt+shift+enter")(h.ctx);
  h.events.get("tool_execution_end")({}, h.ctx);
  h.setBranch([assistant("All done.")]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 1, "tool-free completion should not receive another nudge");
}

// Completion suffixes are not mistaken for completion declarations.
{
  const h = makeHarness();
  await h.shortcuts.get("alt+shift+enter")(h.ctx);
  h.setBranch([assistant("The task is incomplete.")]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 2, "incomplete was incorrectly treated as complete");
}

// Generic phase completion and natural negation do not stop the burst.
for (const text of ["The first phase is complete.", "The work is not yet complete.", "Not everything is complete."]) {
  const h = makeHarness();
  await h.shortcuts.get("alt+shift+enter")(h.ctx);
  h.setBranch([assistant(text)]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 2, `${text} was incorrectly treated as overall completion`);
}

const positive = makeHarness();
await positive.shortcuts.get("alt+shift+enter")(positive.ctx);
positive.setBranch([assistant("The work is done.")]);
await positive.events.get("agent_settled")({}, positive.ctx);
assert(positive.sent.length === 1, "subject-based completion was missed");

// Concurrent idle nudges collapse to one request.
{
  const h = makeHarness();
  await Promise.all([h.shortcuts.get("alt+g")(h.ctx), h.shortcuts.get("alt+g")(h.ctx)]);
  assert(h.sent.length === 1, "concurrent idle nudges overlapped");
}

// Invalid mode arguments are rejected.
{
  const h = makeHarness();
  await h.commands.get("go-on-mode")("typo", h.ctx);
  assert(h.sent.length === 0, "invalid mode argument sent a nudge");
  assert(h.notifications.at(-1)?.[1] === "warning", "invalid mode argument lacked warning");
}

// Missing model disarms the combined shortcut rather than leaving mode armed.
{
  const h = makeHarness({ model: null });
  await h.shortcuts.get("alt+shift+enter")(h.ctx);
  assert(h.sent.length === 0, "missing model sent a nudge");
  assert(h.statuses.at(-1)?.[1] === undefined, "missing model left mode armed");
}

// Legacy burst fallback is ctrl+alt+g and behaves exactly like the canonical burst.
{
  const h = makeHarness();
  await h.shortcuts.get("ctrl+alt+g")(h.ctx);
  assert(h.sent.length === 1, "legacy burst did not send an initial nudge");
  assert(h.statuses.at(-1)?.[1] === "go-on: armed (1)", "legacy burst did not arm");
  // Second press disarms.
  await h.shortcuts.get("ctrl+alt+g")(h.ctx);
  assert(h.statuses.at(-1)?.[1] === undefined, "second legacy burst press did not disarm");
}

// alt+enter must not be claimed by go-on (reserved for app.message.followUp).
{
  const h = makeHarness();
  assert(!h.shortcuts.has("alt+enter"), "go-on still registers the reserved alt+enter key");
}

console.log("go-on behavioral checks passed");
