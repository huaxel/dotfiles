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

const { getSessionRoot } = await import("./session-breakdown.ts");
const previous = process.env.PI_CODING_AGENT_DIR;
try {
  delete process.env.PI_CODING_AGENT_DIR;
  assert.equal(getSessionRoot(), join(homedir(), ".pi", "agent", "sessions"));

  process.env.PI_CODING_AGENT_DIR = "~/custom-pi-agent";
  assert.equal(getSessionRoot(), join(homedir(), "custom-pi-agent", "sessions"));
} finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
  await rm(stubDir, { recursive: true, force: true });
}

console.log("session-breakdown path tests passed");
