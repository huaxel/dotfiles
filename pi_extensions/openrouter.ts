import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface OpenRouterModel {
	id: string;
	name?: string;
	architecture?: { modality?: string };
	context_length?: number;
	top_provider?: { max_completion_tokens?: number };
	pricing?: { prompt?: number; completion?: number };
}

// Heuristic: detect reasoning models from OpenRouter IDs.
// Expand this list as new reasoning models appear.
const REASONING_MODELS = new Set([
	"deepseek/deepseek-r1",
	"openai/o3-mini",
	"openai/o1",
	"openai/o1-mini",
	"openai/o1-preview",
	"anthropic/claude-3.7-sonnet:thinking",
	"perplexity/sonar-reasoning",
	"google/gemini-2.5-flash-preview:thinking",
]);

function isReasoningModel(id: string): boolean {
	if (REASONING_MODELS.has(id)) return true;
	// Fallback heuristic for variants (e.g., :free, :nitro, :extended)
	const baseId = id.split(":")[0];
	if (REASONING_MODELS.has(baseId)) return true;
	return /\b(r1|o1|o3|reasoning|thinking)\b/i.test(id);
}

export default async function (pi: ExtensionAPI) {
	const OPENROUTER_URL = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1";
	const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

	if (!OPENROUTER_KEY) {
		console.warn("[openrouter-dynamic] Missing OPENROUTER_API_KEY, skipping dynamic model fetch.");
		return;
	}

	try {
		const response = await fetch(`${OPENROUTER_URL}/models`, {
			headers: {
				Authorization: `Bearer ${OPENROUTER_KEY}`,
			},
		});

		if (!response.ok) {
			console.error(`[openrouter-dynamic] Failed to fetch models: ${response.status} ${response.statusText}`);
			return;
		}

		const data = (await response.json()) as { data: OpenRouterModel[] };

		const models = data.data.map((model) => ({
			id: model.id,
			name: model.name || model.id,
			reasoning: isReasoningModel(model.id),
			input: model.architecture?.modality === "text+image" ? (["text", "image"] as const) : (["text"] as const),
			contextWindow: model.context_length || 128_000,
			// OpenRouter returns per-token pricing; Pi expects per-million-token cost.
			maxTokens: model.top_provider?.max_completion_tokens || 8192,
			cost: {
				input: (model.pricing?.prompt || 0) * 1_000_000,
				output: (model.pricing?.completion || 0) * 1_000_000,
				cacheRead: 0,
				cacheWrite: 0,
			},
		}));

		pi.registerProvider("openrouter-dynamic", {
			baseUrl: OPENROUTER_URL,
			apiKey: OPENROUTER_KEY,
			api: "openai-completions",
			models,
		});

		console.log(`[openrouter-dynamic] Registered ${models.length} models from OpenRouter`);
	} catch (error) {
		console.error(`[openrouter-dynamic] Error fetching models from openrouter:`, error);
	}
}
