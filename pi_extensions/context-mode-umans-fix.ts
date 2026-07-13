/**
 * Fix: context-mode routing anchor should mention umans_web_search.
 *
 * context-mode's routing block tells the model to use ctx_fetch_and_index
 * for web pages. This extension appends a hint to the WebFetch line so the
 * model also knows about umans_web_search as an alternative. Harmless for
 * non-umans providers (the tool won't be available so the model won't use it).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HINT =
  " For real-time web searches with the umans provider, prefer umans_web_search.";

export default function (pi: ExtensionAPI) {
  pi.on("context", (event) => {
    const messages = event.messages;
    let modified = false;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        (msg.role === "system" || msg.role === "user") &&
        typeof msg.content === "string" &&
        msg.content.includes("WebFetch → use ctx_fetch_and_index")
      ) {
        // Skip if umans_web_search already mentioned
        if (msg.content.includes("umans_web_search")) continue;

        messages[i] = {
          role: msg.role,
          content: msg.content.replace(
            "WebFetch → use ctx_fetch_and_index;",
            "WebFetch → use ctx_fetch_and_index or umans_web_search tool;"
          ),
        };
        modified = true;
        break;
      }
    }

    if (modified) return { messages };
  });
}
