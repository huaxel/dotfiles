// Behavioral tests for restart.ts pure helpers. Run: node pi/agent/extensions/restart.test.mjs
import { register } from "node:module";

register(new URL("./pi-resolve-hook.mjs", import.meta.url), import.meta.url);

const { extractHandoffText } = await import(new URL("./restart.ts", import.meta.url));

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

console.log("restart helper tests passed");
