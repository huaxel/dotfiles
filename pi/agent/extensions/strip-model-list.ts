import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * strip-model-list — Remove the massive inline model enumeration from pi's
 * auto-generated system prompt.
 *
 * Pi injects every model from every registered provider into the system
 * prompt as a comma-separated list (~400 models, ~15-20KB of tokens).
 * The model doesn't need to see every SKU — the runtime handles routing.
 *
 * This extension hooks before_agent_start and strips that list, replacing
 * it with a concise sentence.
 */
export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const prompt = event.systemPrompt;
    if (!prompt) return;

    // The model list is appended to a workflow-guideline bullet point:
    //
    //   "The user's currently available models (route only to these) are:
    //    cloudflare-ai-gateway/claude-3-5-haiku, ..., nan/gemma4."
    //
    // We replace everything from that anchor through the end of the
    // current paragraph (right before the next "- " bullet).
    const cleaned = prompt.replace(
      /The user's currently available models \(route only to these\) are:[\s\S]*?(?=\n- |\n{2,}|$)/,
      "The user's currently available models are managed by pi at runtime \u2014 use tiers or an explicit model ID.",
    );

    return { systemPrompt: cleaned };
  });
}
