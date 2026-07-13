import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/**
 * NaN provider — https://nan.builders
 *
 * OpenAI-compatible LiteLLM gateway offering curated open models.
 * Models are fetched dynamically from the /v1/models endpoint and merged
 * with a static capability map for per-model metadata (reasoning support,
 * context window, thinking format).
 *
 * Setup:
 *   1. Get an API key from https://nan.builders
 *   2. Export it:  export NAN_API_KEY="nk-..."
 *   3. Reload pi (/reload) and pick a `nan/*` model via /model.
 */

const BASE_URL = "https://api.nan.builders/v1";

// ---------------------------------------------------------------------------
// Known model specs — keyed by the bare model ID (no nan/ prefix).
// Models returned by /v1/models not in this map get conservative defaults.
// ---------------------------------------------------------------------------
type ModelSpec = {
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  thinkingFormat?: "deepseek" | "qwen";
};

const KNOWN_SPECS: Record<string, ModelSpec> = {
  "deepseek-v4-flash": {
    reasoning: true,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 32_000,
    thinkingFormat: "deepseek",
  },
  "deepseek-v4-pro": {
    reasoning: true,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 32_000,
    thinkingFormat: "deepseek",
  },
  "mimo-v2.5": {
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 32_000,
  },
  "mimo-v2.5-free": {
    reasoning: false,
    input: ["text"],
    contextWindow: 262_144,
    maxTokens: 16_384,
  },
  "glm5.2": {
    reasoning: true,
    input: ["text"],
    contextWindow: 262_144,
    maxTokens: 32_000,
  },
  "qwen3.6": {
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262_144,
    maxTokens: 32_000,
    thinkingFormat: "qwen",
  },
  "gemma4": {
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262_144,
    maxTokens: 32_000,
  },
};



// ---------------------------------------------------------------------------
// Build a human-friendly display name from a model ID
// ---------------------------------------------------------------------------
function displayName(id: string): string {
  return id
    .replace(/[-_]/g, " ") // hyphens/underscores → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase()) // title-case
    .replace(/(\d+)x(\d+)/gi, "$1x$2") // preserve "35B-A3B" style
    .replace(/(\d+)\s*[Bb]\b/g, (m) => m.toUpperCase())
    .trim();
}



/** Convert a bare model ID + spec into a ProviderModelConfig. */
function toProviderModel(id: string, spec: ModelSpec): ProviderModelConfig {
  return {
    id,
    name: `${displayName(id)} (NaN)`,
    reasoning: spec.reasoning,
    input: spec.input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: spec.contextWindow,
    maxTokens: spec.maxTokens,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      ...(spec.thinkingFormat ? { thinkingFormat: spec.thinkingFormat } : {}),
    },
  };
}

export default async function (pi: ExtensionAPI) {
  // Hardcode known models — no startup fetch needed.
  // The model list barely changes; /reload picks up new ones if needed.
  const models: ProviderModelConfig[] = Object.entries(KNOWN_SPECS).map(
    ([id, spec]) => toProviderModel(id, spec),
  );

  pi.registerProvider("nan", {
    name: "NaN Builders",
    baseUrl: BASE_URL,
    apiKey: "$NAN_API_KEY",
    api: "openai-completions",
    authHeader: true,
    models,
  });
}
