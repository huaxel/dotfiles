/**
 * Fix: pi-context-mode routing anchor should mention umans_web_search.
 *
 * Uses before_provider_request to modify the FINAL payload just before it's
 * sent to the LLM — after ALL context-mode injections, system prompt assembly,
 * and message conversion have happened. This is the only hook that fires late
 * enough to see the fully-assembled anchor text.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OLD = "Web pages → ctx_fetch_and_index then ctx_search.";
const NEW = "Web pages → ctx_fetch_and_index or umans_web_search tool then ctx_search.";

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    try {
      const request = event.request;
      if (!request) return;

      // OpenAI-compatible format: { messages: [...] }
      const messages: Array<{ role: string; content: string }> = request.messages;
      if (!messages) return;

      for (const msg of messages) {
        if (
          typeof msg.content === "string" &&
          msg.content.includes("context-mode active. Hierarchy:") &&
          !msg.content.includes("umans_web_search")
        ) {
          msg.content = msg.content.replace(OLD, NEW);
        }
      }
    } catch {
      // best effort — never break the request
    }
  });
}
