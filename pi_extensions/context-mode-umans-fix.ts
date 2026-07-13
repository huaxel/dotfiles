/**
 * Fix: pi-context-mode routing anchor should mention umans_web_search.
 *
 * Two approaches:
 * 1. Intercepts the context event before each LLM call and appends a hint
 *    about umans_web_search to the routing anchor.
 * 2. Clears Node's module cache at load time so the patched extension.js
 *    is picked up fresh on every /reload.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OLD = "Web pages → ctx_fetch_and_index then ctx_search.";
const NEW = "Web pages → ctx_fetch_and_index or umans_web_search tool then ctx_search.";

const EXT_JS = resolve(
  process.env.HOME ?? "/Users/juanbenjumea",
  ".pi/agent/npm/node_modules/context-mode/build/adapters/pi/extension.js"
);

function patchDiskIfNeeded(): boolean {
  try {
    if (!existsSync(EXT_JS)) return false;
    const content = readFileSync(EXT_JS, "utf-8");
    if (content.includes("umans_web_search")) return true; // already patched
    const patched = content.replace(OLD, NEW);
    require("fs").writeFileSync(EXT_JS, patched);
    return true;
  } catch { return false; }
}

function clearModuleCache(): void {
  delete require.cache[EXT_JS];
  // jiti cache key may differ — also try with/without extension
  for (const key of Object.keys(require.cache)) {
    if (key.includes("extension.js") && key.includes("context-mode")) {
      delete require.cache[key];
    }
  }
}

export default function (pi: ExtensionAPI) {
  // On load: patch file on disk and clear module cache so next /reload picks it up
  clearModuleCache();
  const ok = patchDiskIfNeeded();

  // Runtime: intercept every LLM call and inject the hint into the anchor message
  pi.on("context", (event) => {
    const messages = event.messages;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        (msg.role === "system" || msg.role === "user") &&
        typeof msg.content === "string" &&
        msg.content.includes("context-mode active. Hierarchy:")
      ) {
        if (msg.content.includes("umans_web_search")) continue;
        messages[i] = {
          role: msg.role,
          content: msg.content.replace(OLD, NEW),
        };
        return { messages };
      }
    }
  });
}
