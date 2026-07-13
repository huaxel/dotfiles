/**
 * Fix: pi-context-mode routing anchor should mention umans_web_search.
 *
 * Intercepts the context event before each LLM call and appends a hint
 * about umans_web_search to the routing anchor in the system prompt.
 * Harmless for non-umans providers (the tool just won't be available).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OLD = "Web pages → ctx_fetch_and_index then ctx_search.";
const NEW = "Web pages → ctx_fetch_and_index or umans_web_search tool then ctx_search.";

export default function (pi: ExtensionAPI) {
  pi.on("context", (event) => {
    const messages = event.messages;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        (msg.role === "system" || msg.role === "user") &&
        typeof msg.content === "string" &&
        msg.content.includes("context-mode active. Hierarchy:")
      ) {
        // Skip if already patched
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
