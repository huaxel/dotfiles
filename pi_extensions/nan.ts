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
// Defaults applied to any model ID returned by the API that we don't know
// ---------------------------------------------------------------------------
const DEFAULT_SPEC: ModelSpec = {
  reasoning: false,
  input: ["text"],
  contextWindow: 128_000,
  maxTokens: 16_384,
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

// ---------------------------------------------------------------------------
// Model list fetching helpers
// ---------------------------------------------------------------------------
type OpenAIModelEntry = { id: string; object: string };

/** Fetch the model list from the NaN API. Returns bare model IDs or null. */
async function fetchModelList(): Promise<string[] | null> {
  const apiKey = process.env.NAN_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as
      | { data: OpenAIModelEntry[] }
      | { data: string[] }
      | string[];

    // OpenAI format: { data: [{ id: "...", ... }] }
    if (body && typeof body === "object" && "data" in body && Array.isArray(body.data)) {
      return body.data.map((e: OpenAIModelEntry) => e.id);
    }

    // LiteLLM sometimes returns just ["model1", "model2"]
    if (Array.isArray(body)) return body;

    return null;
  } catch {
    return null;
  }
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
  let models: ProviderModelConfig[] = [];

  const remoteIds = await fetchModelList();

  if (remoteIds && remoteIds.length > 0) {
    // Build from the remote list, falling back to KNOWN_SPECS or defaults
    const seen = new Set<string>();
    for (const rawId of remoteIds) {
      const spec = KNOWN_SPECS[rawId] ?? DEFAULT_SPEC;
      models.push(toProviderModel(rawId, spec));
      seen.add(rawId);
    }

    // Also include any known models that the API didn't return (but might
    // become available again later without a restart)
    for (const knownId of Object.keys(KNOWN_SPECS)) {
      if (!seen.has(knownId)) {
        models.push(toProviderModel(knownId, KNOWN_SPECS[knownId]));
      }
    }
  } else {
    // Fetch failed — fall back to the known spec list
    for (const [id, spec] of Object.entries(KNOWN_SPECS)) {
      models.push(toProviderModel(id, spec));
    }
  }

  pi.registerProvider("nan", {
    name: "NaN Builders",
    baseUrl: BASE_URL,
    apiKey: "$NAN_API_KEY",
    api: "openai-completions",
    authHeader: true,
    models,
  });
}
