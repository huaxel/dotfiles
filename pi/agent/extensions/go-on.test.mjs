// Behavioral tests for go-on.ts. Run: node pi/agent/extensions/go-on.test.mjs
// (from the repo root). Mocks the pi extension API; no pi install needed.
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

const BURST = "ctrl+alt+g"; // the one burst key on every platform
const NUDGE = "ctrl+alt+n"; // the one nudge key on every platform
const BURST_ALT = "alt+g"; // fallback for SSH clients that drop the Ctrl bit
const NUDGE_ALT = "alt+n";
const assistant = (text, stopReason = "stop") => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text }], stopReason } });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Four keys are registered: nudge + burst, each with a plain-alt fallback.
{
  const h = makeHarness();
  const keys = [...h.shortcuts.keys()].sort();
  assert(
    keys.length === 4 &&
      keys.includes(NUDGE) &&
      keys.includes(BURST) &&
      keys.includes(NUDGE_ALT) &&
      keys.includes(BURST_ALT),
    `unexpected key set: ${keys.join(", ")}`,
  );
  // Fallbacks must behave identically to their primary chord.
  const hBurst = makeHarness();
  await hBurst.shortcuts.get(BURST_ALT)(hBurst.ctx);
  assert(hBurst.sent.length === 1, "alt+g fallback did not send its burst nudge");
  const hNudge = makeHarness();
  await hNudge.shortcuts.get(NUDGE_ALT)(hNudge.ctx);
  assert(hNudge.sent.length === 1, "alt+n fallback did not send its nudge");
}

// Plain toggle (command) arms without sending an initial message; the burst
// key pressed while armed is the toggle-off.
{
  const h = makeHarness();
  await h.commands.get("go-on-mode")("on", h.ctx);
  assert(h.sent.length === 0, "toggle unexpectedly sent an initial nudge");
  assert(h.statuses.at(-1)?.[1] === "go-on: armed", "toggle did not arm");
  await h.shortcuts.get(BURST)(h.ctx);
  assert(h.statuses.at(-1)?.[1] === undefined, "burst key did not disarm when armed");
}

// /go-on mode: nudge + arm, without toggling off if already armed.
{
  const h = makeHarness();
  await h.commands.get("go-on")("mode", h.ctx);
  assert(h.sent.length === 1 && h.sent[0][0] === "go on", "/go-on mode did not send its nudge");
  assert(h.statuses.at(-1)?.[1] === "go-on: armed (1)", "/go-on mode did not arm");
  h.events.get("agent_start")({}, h.ctx);
  await h.commands.get("go-on")("mode", h.ctx);
  assert(h.sent.length === 2, "repeating /go-on mode did not send another nudge");
  assert(h.statuses.at(-1)?.[1] === "go-on: armed (2)", "repeating /go-on mode toggled mode off");
}

// Plain /go-on remains a single nudge and does not arm auto mode.
{
  const h = makeHarness();
  await h.commands.get("go-on")("", h.ctx);
  assert(h.sent.length === 1 && h.statuses.length === 0, "plain /go-on changed mode");
}

// Burst from idle: nudge + arm; second press disarms.
{
  const h = makeHarness();
  await h.shortcuts.get(BURST)(h.ctx);
  assert(h.sent.length === 1, "burst did not send an initial nudge");
  assert(h.statuses.at(-1)?.[1] === "go-on: armed (1)", "burst did not arm");
  await h.shortcuts.get(BURST)(h.ctx);
  assert(h.statuses.at(-1)?.[1] === undefined, "second burst press did not disarm");
}

// Completion is honored even after tool work.
{
  const h = makeHarness();
  await h.shortcuts.get(BURST)(h.ctx);
  h.events.get("tool_execution_end")({}, h.ctx);
  h.setBranch([assistant("All done.")]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 1, "tool-free completion should not receive another nudge");
}

// Completion suffixes are not mistaken for completion declarations.
{
  const h = makeHarness();
  await h.shortcuts.get(BURST)(h.ctx);
  h.setBranch([assistant("The task is incomplete.")]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 2, "incomplete was incorrectly treated as complete");
}

// Generic phase completion and natural negation do not stop the burst.
for (const text of ["The first phase is complete.", "The work is not yet complete.", "Not everything is complete."]) {
  const h = makeHarness();
  await h.shortcuts.get(BURST)(h.ctx);
  h.setBranch([assistant(text)]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 2, `${text} was incorrectly treated as overall completion`);
}

// Subject-qualified "all set"/"wrapped up" are NOT overall completion.
for (const text of ["The environment is all set.", "Phase one is wrapped up.", "The first phase is wrapped up"]) {
  const h = makeHarness();
  await h.shortcuts.get(BURST)(h.ctx);
  h.setBranch([assistant(text)]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 2, `${text} was incorrectly treated as overall completion`);
}

// Overall-task subject or standalone "all set"/"wrapped up" DO complete.
for (const text of ["The task is all set.", "All set.", "Wrapped up."]) {
  const h = makeHarness();
  await h.shortcuts.get(BURST)(h.ctx);
  h.setBranch([assistant(text)]);
  await h.events.get("agent_settled")({}, h.ctx);
  assert(h.sent.length === 1, `${text} was not treated as completion`);
}

const positive = makeHarness();
await positive.shortcuts.get(BURST)(positive.ctx);
positive.setBranch([assistant("The work is done.")]);
await positive.events.get("agent_settled")({}, positive.ctx);
assert(positive.sent.length === 1, "subject-based completion was missed");

// Concurrent idle nudges collapse to one request.
{
  const h = makeHarness();
  await Promise.all([h.shortcuts.get(NUDGE)(h.ctx), h.shortcuts.get(NUDGE)(h.ctx)]);
  assert(h.sent.length === 1, "concurrent idle nudges overlapped");
}

// The nudge key sends a single "go on" and can nudge again after agent_start.
{
  const h = makeHarness();
  await h.shortcuts.get(NUDGE)(h.ctx);
  assert(h.sent.length === 1 && h.sent[0][0] === "go on", "nudge did not send a single 'go on'");
  // The real pi fires agent_start when the prompt starts, clearing the
  // idle-pending guard; simulate it so the second press can nudge again.
  h.events.get("agent_start")({}, h.ctx);
  await h.shortcuts.get(NUDGE)(h.ctx);
  assert(h.sent.length === 2, "nudge did not send a second nudge after agent_start");
}

// Invalid mode arguments are rejected.
{
  const h = makeHarness();
  await h.commands.get("go-on-mode")("typo", h.ctx);
  assert(h.sent.length === 0, "invalid mode argument sent a nudge");
  assert(h.notifications.at(-1)?.[1] === "warning", "invalid mode argument lacked warning");
}

// Missing model disarms the burst rather than leaving mode armed.
{
  const h = makeHarness({ model: null });
  await h.shortcuts.get(BURST)(h.ctx);
  assert(h.sent.length === 0, "missing model sent a nudge");
  assert(h.statuses.at(-1)?.[1] === undefined, "missing model left mode armed");
}

// Keys that must never be claimed: alt+enter (reserved for app.message.followUp),
// alt+g / alt+shift+enter (superseded by the universal ctrl+alt pair), and any
// Keys that must stay unregistered: alt+enter is reserved by pi, alt+shift
// chords cannot be encoded on legacy terminals, ctrl+alt+o is unused, and
// alt+g / alt+n are now deliberate Termius fallbacks (SSH clients drop the
// Ctrl bit on Ctrl+Alt chords), so they are NOT banned anymore.
{
  const h = makeHarness();
  for (const banned of ["alt+enter", "alt+shift+enter", "alt+shift+g", "ctrl+alt+o"]) {
    assert(!h.shortcuts.has(banned), `go-on still registers banned key ${banned}`);
  }
}

console.log("go-on behavioral checks passed");
