import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { resolve as piResolve } from "./pi-resolve-hook.mjs";

const stubDir = await mkdtemp(join(tmpdir(), "session-breakdown-test-"));
const stubPath = join(stubDir, "pi-coding-agent-stub.mjs");
await writeFile(
  stubPath,
  `import { homedir } from "node:os";
import { join } from "node:path";
export function getAgentDir() {
  const value = process.env.PI_CODING_AGENT_DIR?.trim();
  if (!value) return join(homedir(), ".pi", "agent");
  return value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}
export class BorderedLoader {}
`,
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@earendil-works/pi-coding-agent") {
      return nextResolve(pathToFileURL(stubPath).href, context);
    }
    return piResolve(specifier, context, nextResolve);
  },
});

const { getSessionRoot, parseSessionFile } = await import("./session-breakdown.ts");
const previous = process.env.PI_CODING_AGENT_DIR;
try {
  delete process.env.PI_CODING_AGENT_DIR;
  assert.equal(getSessionRoot(), join(homedir(), ".pi", "agent", "sessions"));

  process.env.PI_CODING_AGENT_DIR = "~/custom-pi-agent";
  assert.equal(getSessionRoot(), join(homedir(), "custom-pi-agent", "sessions"));

  const sessionPath = join(stubDir, "2026-02-02T21-52-28-774Z_fixture.jsonl");
  await writeFile(sessionPath, [
    JSON.stringify({ type: "session", cwd: "/work/project" }),
    "not valid json",
    JSON.stringify({ type: "model_change", provider: "openai", modelId: "gpt-test" }),
    JSON.stringify({ type: "message", message: { role: "assistant", provider: "openai", model: "gpt-test", usage: { totalTokens: 12, cost: 0.02 } } }),
    JSON.stringify({ type: "model_change", provider: "faux", modelId: "faux-1" }),
    JSON.stringify({ type: "message", message: { role: "assistant", usage: { totalTokens: 999 } } }),
  ].join("\n"));
  const parsed = await parseSessionFile(sessionPath);
  assert.equal(parsed?.messages, 1, "malformed JSON is skipped and faux messages are excluded");
  assert.equal(parsed?.tokens, 12, "usage tokens are accumulated");
  assert.equal(parsed?.totalCost, 0.02, "usage cost is accumulated");
  assert.equal(parsed?.cwd, "/work/project");
  assert.equal(parsed?.dayKeyLocal, "2026-02-02");
  assert.equal(parsed?.messagesByModel.get("openai/gpt-test"), 1);
  assert.equal(await parseSessionFile(sessionPath, AbortSignal.abort()), null, "pre-aborted parse returns null");
} finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
  await rm(stubDir, { recursive: true, force: true });
}

console.log("session-breakdown path and parser tests passed");
