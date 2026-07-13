/**
 * Fix for context-mode + umans provider compatibility.
 * 
 * This extension modifies context-mode's routing anchor to include
 * umans_web_search as an allowed tool when using the umans provider.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Hook into context assembly to modify context-mode's routing anchor
  pi.on("context", (event) => {
    const messages = event.messages;
    
    // Check if we're using the umans provider
    // @ts-ignore - accessing internal context
    const provider = event.provider ?? event.model?.provider;
    
    if (provider !== "umans") return;
    
    // Find and modify context-mode's routing anchor in the messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user" && typeof msg.content === "string") {
        // Check if this is context-mode's routing anchor
        if (msg.content.includes("context-mode active. Hierarchy:")) {
          // Modify the routing anchor to include umans_web_search
          messages[i] = {
            role: "user",
            content: msg.content.replace(
              "Web pages → ctx_fetch_and_index then ctx_search.",
              "Web pages → ctx_fetch_and_index then ctx_search. For real-time web searches, use umans_web_search tool."
            ),
          };
          break;
        }
      }
    }
    
    return { messages };
  });
}
