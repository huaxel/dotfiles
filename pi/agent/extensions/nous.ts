import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/**
 * Nous Research Inference API — https://inference-api.nousresearch.com
 *
 * OpenAI-compatible router (OpenRouter-style catalog) offering Nous's own
 * Hermes models plus many third-party models, currently at promotional prices
 * (see the `original` vs `current` pricing in the /v1/models catalog).
 *
 * Models are handpicked static specs (see KNOWN_SPECS below); add or remove
 * entries as the catalog evolves. To discover the live catalog:
 *   curl -s https://inference-api.nousresearch.com/v1/models | jq '.data[].id'
 *
 * Setup:
 *   1. Get an API key from https://portal.nousresearch.com
 *   2. Export it:  export NOUS_API_KEY="nk-..."
 *   3. Reload pi (/reload) and pick a `nous/*` model via /model.
 */

const BASE_URL = "https://inference-api.nousresearch.com/v1";

type ModelSpec = {
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** Maps pi thinking levels to the provider's reasoning_effort values; null hides a level. */
  thinkingLevelMap?: ProviderModelConfig["thinkingLevelMap"];
  /** Models that do not accept reasoning_effort (not in the catalog's supported_parameters). */
  supportsReasoningEffort?: boolean;
};

// Shared compat: send the system prompt as `system` (not OpenAI `developer`),
// use `max_tokens` (the field this API documents), and skip the `store` param.
const COMPAT = {
  supportsDeveloperRole: false,
  supportsStore: false,
  maxTokensField: "max_tokens" as const,
};

const KNOWN_SPECS: Record<string, ModelSpec> = {
  // The router's standout deal: $0.01/$0.02 per M (9x cheaper than OpenRouter,
  // ~14x cheaper than DeepSeek direct). 1M context, reasoning on by default.
  "deepseek/deepseek-v4-flash-0731": {
    name: "DeepSeek V4 Flash 0731",
    reasoning: true,
    input: ["text"],
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 },
    // Catalog supported_efforts: max, high, low (default high).
    thinkingLevelMap: {
      minimal: "low",
      low: "low",
      medium: "high",
      high: "high",
      xhigh: "max",
      max: "max",
    },
  },
  // 1M-context flagship reasoning model (text + image).
  "thinkingmachines/inkling": {
    name: "Thinking Machines Inkling",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_048_576,
    maxTokens: 32_768,
    cost: { input: 0.8, output: 3.24, cacheRead: 0.136, cacheWrite: 0 },
    // Catalog supported_efforts: max, high, medium, low, minimal, none.
    thinkingLevelMap: {
      off: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "max",
      max: "max",
    },
  },
  // Free tier model (50 RPM / 500k TPM on free plans).
  "tencent/hy3:free": {
    name: "Tencent Hy3 (free)",
    reasoning: true,
    input: ["text"],
    contextWindow: 262_144,
    maxTokens: 32_768,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // Catalog supported_efforts: high, low, none.
    thinkingLevelMap: {
      off: "none",
      minimal: "low",
      low: "low",
      medium: "high",
      high: "high",
      xhigh: "high",
      max: "high",
    },
  },
  // Free tier model; no reasoning_effort support — reasoning on by default.
  "inclusionai/ling-3.0-flash:free": {
    name: "Inclusion AI Ling 3.0 Flash (free)",
    reasoning: true,
    input: ["text"],
    contextWindow: 262_144,
    maxTokens: 32_768,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    supportsReasoningEffort: false,
  },
  // Free tier model; no reasoning_effort support.
  "poolside/laguna-s-2.1:free": {
    name: "Poolside Laguna S 2.1 (free)",
    reasoning: true,
    input: ["text"],
    contextWindow: 262_144,
    maxTokens: 32_768,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    supportsReasoningEffort: false,
  },
  // Free tier model; reasoning is mandatory (efforts high/medium/low).
  "stepfun/step-3.7-flash:free": {
    name: "StepFun Step 3.7 Flash (free)",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 262_144,
    maxTokens: 32_768,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    thinkingLevelMap: {
      minimal: "low",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
      max: "high",
    },
  },
};

export default function (pi: ExtensionAPI) {
  const models: ProviderModelConfig[] = Object.entries(KNOWN_SPECS).map(
    ([id, spec]) => ({
      id,
      name: `${spec.name} (Nous)`,
      reasoning: spec.reasoning,
      input: spec.input,
      cost: spec.cost,
      contextWindow: spec.contextWindow,
      maxTokens: spec.maxTokens,
      ...(spec.thinkingLevelMap ? { thinkingLevelMap: spec.thinkingLevelMap } : {}),
      compat: {
        ...COMPAT,
        // Auto-detection defaults supportsReasoningEffort to true for custom
        // providers; disable it for models that don't accept the parameter.
        ...(spec.supportsReasoningEffort === false
          ? { supportsReasoningEffort: false }
          : {}),
      },
    }),
  );

  pi.registerProvider("nous", {
    name: "Nous Research",
    baseUrl: BASE_URL,
    apiKey: "$NOUS_API_KEY",
    api: "openai-completions",
    authHeader: true, // send Authorization: Bearer <key> (not handled by the adapter itself)
    models,
  });
}
