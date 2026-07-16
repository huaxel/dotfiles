import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * ClinePass provider — https://docs.cline.bot/getting-started/clinepass
 *
 * Flat $9.99/month subscription giving access to a curated set of open coding
 * models with 2-5x API rate limits. The API is OpenAI Chat Completions
 * compatible at https://api.cline.bot/api/v1.
 *
 * Reasoning control uses standard OpenAI `reasoning_effort` rather than
 * provider-specific fields (`thinking`, `enable_thinking`), because Cline's
 * gateway passes through to multiple backends and only the OpenAI-compatible
 * contract is documented.
 *
 * Setup:
 *   1. Subscribe at https://app.cline.bot (Settings > API Keys) to get a key.
 *   2. Export it:  export CLINE_API_KEY="ck_..."
 *   3. Reload pi (/reload) and pick a `cline-pass/*` model via /model.
 */

const BASE_URL = "https://api.cline.bot/api/v1";

// Reference per-1M-token prices from the ClinePass docs. ClinePass is a flat
// subscription so these are NOT charged to you — they're kept here only so
// pi's usage/cost tracking shows the underlying value of your usage.
//
// Model ID                                  Input   Output  CacheRead CacheWrite
// cline-pass/glm-5.2                        1.40    4.40    0.26      -
// cline-pass/kimi-k2.7-code                 0.95    4.00    0.19      -
// cline-pass/kimi-k2.6                      0.95    4.00    0.16      -
// cline-pass/deepseek-v4-pro                1.74    3.48    0.0145    -
// cline-pass/deepseek-v4-flash              0.14    0.28    0.0028    -
// cline-pass/mimo-v2.5                      0.14    0.28    0.0028    -
// cline-pass/mimo-v2.5-pro                  1.74    3.48    0.0145    -
// cline-pass/minimax-m3                     0.30    1.20    0.06      -
// cline-pass/qwen3.7-max                    2.50    7.50    0.50      3.125
// cline-pass/qwen3.7-plus (<=256K)          0.40    1.60    0.04      0.50
// cline-pass/qwen3.7-plus (>256K)           1.20    4.80    0.12      1.50

/** Per-model definition. Cost field uses the full runtime type which supports optional tiers. */
type ModelDef = {
  id: string;
  name: string;
  reasoning: boolean;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    tiers?: Array<{
      inputTokensAbove: number;
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    }>;
  };
  contextWindow: number;
  maxTokens: number;
};

const MODELS: ModelDef[] = [
  {
    id: "cline-pass/glm-5.2",
    name: "GLM-5.2 (ClinePass)",
    reasoning: true,
    cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/kimi-k2.7-code",
    name: "Kimi K2.7 Code (ClinePass)",
    reasoning: true,
    cost: { input: 0.95, output: 4.0, cacheRead: 0.19, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/kimi-k2.6",
    name: "Kimi K2.6 (ClinePass)",
    reasoning: true,
    cost: { input: 0.95, output: 4.0, cacheRead: 0.16, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/deepseek-v4-pro",
    name: "DeepSeek V4 Pro (ClinePass)",
    reasoning: true,
    cost: { input: 1.74, output: 3.48, cacheRead: 0.0145, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/deepseek-v4-flash",
    name: "DeepSeek V4 Flash (ClinePass)",
    reasoning: true,
    cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/mimo-v2.5",
    name: "MiMo-V2.5 (ClinePass)",
    reasoning: false,
    cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: "cline-pass/mimo-v2.5-pro",
    name: "MiMo-V2.5-Pro (ClinePass)",
    reasoning: true,
    cost: { input: 1.74, output: 3.48, cacheRead: 0.0145, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/minimax-m3",
    name: "MiniMax M3 (ClinePass)",
    reasoning: false,
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 16384,
  },
  {
    id: "cline-pass/qwen3.7-max",
    name: "Qwen3.7 Max (ClinePass)",
    reasoning: true,
    cost: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
    contextWindow: 262144,
    maxTokens: 32768,
  },
  {
    id: "cline-pass/qwen3.7-plus",
    name: "Qwen3.7 Plus (ClinePass)",
    reasoning: true,
    // Two pricing tiers: ≤256K input uses lower rates, >256K uses higher rates.
    // The tier activates when total input tokens exceed 256K.
    cost: {
      input: 0.4,
      output: 1.6,
      cacheRead: 0.04,
      cacheWrite: 0.5,
      tiers: [
        {
          inputTokensAbove: 256000,
          input: 1.2,
          output: 4.8,
          cacheRead: 0.12,
          cacheWrite: 1.5,
        },
      ],
    },
    contextWindow: 1048576,
    maxTokens: 32768,
  },
];

export default function (pi: ExtensionAPI) {
  pi.registerProvider("cline-pass", {
    name: "ClinePass",
    baseUrl: BASE_URL,
    apiKey: "$CLINE_API_KEY",
    api: "openai-completions",
    authHeader: true, // Authorization: Bearer <key>
    models: MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      // Text-only by default. Cline's API supports images on some models but
      // ClinePass per-model vision capability is not documented. Remove this
      // restriction per-model once vision support is verified against the API.
      input: ["text"],
      cost: m.cost,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      compat: {
        // Cline's API follows the OpenAI Chat Completions format. Use standard
        // reasoning_effort for thinking control instead of provider-specific
        // request fields (thinking, enable_thinking) which may not route
        // correctly through Cline's multi-backend gateway.
        supportsDeveloperRole: false,
        supportsStore: false,
        supportsReasoningEffort: true,
        // max_tokens is more universally supported across OpenAI-compatible
        // endpoints than max_completion_tokens.
        maxTokensField: "max_tokens",
      },
    })),
  });
}
