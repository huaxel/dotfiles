import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Gemma 4 provider — via Google Gemini API / Google AI Studio
 *
 * Google hosts Gemma 4 (Gemma-4-31B and Gemma-4-26B-A4B) through the Gemini
 * API. Free tier includes ~15 RPM and ~1500 req/day for Gemma 4 models.
 *
 * Model docs: https://www.philschmid.de/gemma-4-gemini-api
 * Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
 *
 * Setup:
 *   1. Get a free API key from https://aistudio.google.com/apikey
 *   2. Export it:  export GEMMA4_API_KEY="your-key-here"
 *   3. Reload pi (/reload) and pick a `gemma4/*` model via /model (e.g. `gemma4/gemma-4-31b-it`).
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Gemma 4 model specs
// - 256K context window
// - Text and image input supported
// - Reasoning/thinking enabled
const MODELS = [
  {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B IT",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262_144,
    maxTokens: 8_192,
  },
  {
    id: "gemma-4-26b-a4b-it",
    name: "Gemma 4 26B A4B IT",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262_144,
    maxTokens: 8_192,
  },
];

export default function (pi: ExtensionAPI) {
  pi.registerProvider("gemma4", {
    name: "Google AI Studio",
    baseUrl: BASE_URL,
    apiKey: "$GEMMA4_API_KEY",
    api: "google-generative-ai",
    models: MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
    })),
  });
}
