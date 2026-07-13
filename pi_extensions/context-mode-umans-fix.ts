/**
 * Fix: context-mode routing anchor should mention umans_web_search.
 *
 * Patches context-mode's built extension.js directly so the hint is
 * always present in the routing anchor — no matter which provider is
 * active. Also patches at reload time so npm updates don't silently
 * remove the fix.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HINT = " or umans_web_search tool";

export default function (pi: ExtensionAPI) {
  // Patch at reload time — catches npm updates that overwrite the built file
  pi.on("session_start", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const extPath = path.resolve(
      process.env.HOME ?? "/Users/juanbenjumea",
      ".pi/agent/npm/node_modules/context-mode/build/adapters/pi/extension.js"
    );

    try {
      if (fs.existsSync(extPath)) {
        const content = fs.readFileSync(extPath, "utf-8");
        if (!content.includes("umans_web_search")) {
          const patched = content.replace(
            "Web pages → ctx_fetch_and_index then ctx_search.",
            "Web pages → ctx_fetch_and_index or umans_web_search tool then ctx_search."
          );
          fs.writeFileSync(extPath, patched);
        }
      }
    } catch {
      // Best-effort — never block session start
    }
  });
}
