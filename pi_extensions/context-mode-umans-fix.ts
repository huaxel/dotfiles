/**
 * Fix: context-mode routing anchor should mention umans_web_search.
 *
 * context-mode's routing anchor tells the model to use ctx_fetch_and_index
 * for web pages, which works poorly with the umans provider that has
 * umans_web_search. This extension appends the hint to every routing anchor
 * message — harmless for non-umans providers (the tool won't be available
 * so the model won't use it).
 *
 * Also patches context-mode's built extension.js directly for immediate
 * effect. This file is a fallback for when npm updates overwrite that patch.
 *
 * Why not detect the provider? ctx.model on the "context" event doesn't
 * reliably have provider info, so we just always add the hint.
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
        msg.role === "user" &&
        typeof msg.content === "string" &&
        msg.content.includes("context-mode active. Hierarchy:")
      ) {
        // Skip if umans_web_search already mentioned
        if (msg.content.includes("umans_web_search")) continue;

        messages[i] = {
          role: "user",
          content: msg.content + HINT,
        };
        modified = true;
        break;
      }
    }

    if (modified) return { messages };
  });
}
