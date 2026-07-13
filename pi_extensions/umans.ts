import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/**
 * Minimal Umans provider for pi.
 *
 * Registers the Umans Code gateway as a provider with hardcoded model list.
 * No web search tool, no vision handoff, no status bar, no OAuth, no polling.
 */

const BASE_URL = "https://api.code.umans.ai";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type ModelDef = {
  id: string;
  vision: boolean;
  ctx: number;
  maxTokens: number;
  reasoning: boolean;
  /** If reasoning can be disabled, mapping: pi level -> umans level. null = unsupported. */
  thinkingMap: Partial<Record<ThinkingLevel, string | null>>;
};

const MODELS: ModelDef[] = [
  {
    id: "umans-coder",
    vision: true,
    ctx: 262_144,
    maxTokens: 32_768,
    reasoning: true,
    // API returns empty levels but the model DOES support thinking.
    // Using the static defaults from the old pi-provider-umans.
    thinkingMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" },
  },
  {
    id: "umans-kimi-k2.7",
    vision: true,
    ctx: 262_144,
    maxTokens: 32_768,
    reasoning: true,
    thinkingMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" },
  },
  {
    id: "umans-flash",
    vision: true,
    ctx: 262_144,
    maxTokens: 32_768,
    reasoning: true,
    thinkingMap: { off: "none", minimal: null, low: "low", medium: "medium", high: "high", xhigh: null },
  },
  {
    id: "umans-glm-5.2",
    vision: false,
    ctx: 405_504,
    maxTokens: 131_071,
    reasoning: true,
    thinkingMap: { off: "none", minimal: null, low: null, medium: null, high: "high", xhigh: "max" },
  },
  {
    id: "umans-qwen3.6-35b-a3b",
    vision: true,
    ctx: 262_144,
    maxTokens: 32_768,
    reasoning: true,
    thinkingMap: { off: "none", minimal: null, low: "low", medium: "medium", high: "high", xhigh: null },
  },
];

function displayName(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toProvider(m: ModelDef): ProviderModelConfig {
  return {
    id: m.id,
    name: `${displayName(m.id)} (Umans)`,
    reasoning: m.reasoning,
    thinkingLevelMap: m.thinkingMap,
    input: m.vision ? (["text", "image"] as const) : (["text"] as const),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.ctx,
    maxTokens: m.maxTokens,
    compat: {
      forceAdaptiveThinking: m.reasoning,
      allowEmptySignature: true,
    },
  };
}

export default async function (pi: ExtensionAPI) {
  const models = MODELS.map(toProvider);

  pi.registerProvider("umans", {
    name: "Umans",
    baseUrl: BASE_URL,
    apiKey: "$UMANS_API_KEY",
    api: "anthropic-messages",
    headers: { "X-Umans-Websearch-Provider": "none" },
    authHeader: true,
    models,
  });
}
