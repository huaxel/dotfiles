import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_NAME = "framearch";
const DISCOVERY_URL = "http://framearch-juan:8000/v1/models";
const API_BASE_URL = "http://framearch-juan:8000/v1";
const DISCOVERY_TIMEOUT_MS = Number(process.env.FRAMEARCH_DISCOVERY_TIMEOUT_MS) || 5000;

const FRAMEARCH_COMPAT = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens" as const,
};

type InputModality = "text" | "image";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type DiscoveredModel = {
	id: string;
	name: string;
	reasoning: boolean;
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
	input: InputModality[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
	compat: typeof FRAMEARCH_COMPAT;
};

type LlamaCppModel = {
	id: string;
	status?: {
		args?: string[];
	};
	architecture?: {
		input_modalities?: string[];
	};
};

function getArgNumber(args: string[] | undefined, name: string): number | undefined {
	const index = args?.indexOf(name) ?? -1;
	if (index < 0) return undefined;
	const value = Number(args?.[index + 1]);
	return Number.isFinite(value) ? value : undefined;
}

function getContextWindow(model: LlamaCppModel): number {
	const envContext = Number(process.env.FRAMEARCH_CTX);
	return getArgNumber(model.status?.args, "--ctx-size") ??
		(Number.isFinite(envContext) && envContext > 0 ? envContext : 128000);
}

function getInputModalities(model: LlamaCppModel): InputModality[] {
	const modalities = model.architecture?.input_modalities ?? [];
	return modalities.includes("image") ? ["text", "image"] : ["text"];
}

function getThinkingBudgetMap(modelId: string): Record<Exclude<ThinkingLevel, "off">, number> | undefined {
	if (modelId.startsWith("gemma-4-")) {
		return {
			minimal: 8,
			low: 48,
			medium: 256,
			high: 1024,
			xhigh: 4096,
		};
	}

	if (/^Qwen3\.[56]-/.test(modelId)) {
		return {
			minimal: 4,
			low: 8,
			medium: 48,
			high: 1024,
			xhigh: 4096,
		};
	}

	return undefined;
}

function supportsLlamaCppThinking(modelId: string): boolean {
	return getThinkingBudgetMap(modelId) !== undefined;
}

// llama.cpp exposes Gemma/Qwen reasoning as request-level
// thinking_budget_tokens plus chat_template_kwargs.enable_thinking, not OpenAI
// reasoning_effort.
function applyLlamaCppThinkingPayload(modelId: string, payload: unknown, thinkingLevel: ThinkingLevel): void {
	if (!payload || typeof payload !== "object") return;

	const request = payload as {
		chat_template_kwargs?: Record<string, unknown>;
		thinking_budget_tokens?: number;
	};

	if (thinkingLevel === "off") {
		request.chat_template_kwargs = {
			...(request.chat_template_kwargs ?? {}),
			enable_thinking: false,
		};
		delete request.thinking_budget_tokens;
		return;
	}

	const budgets = getThinkingBudgetMap(modelId);
	if (!budgets) return;

	request.chat_template_kwargs = {
		...(request.chat_template_kwargs ?? {}),
		enable_thinking: true,
	};
	request.thinking_budget_tokens = budgets[thinkingLevel];
}

/** Cached discovered models */
let discoveredModels: DiscoveredModel[] | undefined;

/** In-flight discovery promise (deduplicates concurrent requests) */
let discoveryPromise: Promise<DiscoveredModel[] | undefined> | undefined;

function registerFramearchProvider(
	pi: ExtensionAPI,
	models?: DiscoveredModel[],
): void {
	const config = {
		baseUrl: API_BASE_URL,
		apiKey: "local",
		api: "openai-completions" as const,
		compat: FRAMEARCH_COMPAT,
		...(models ? { models } : {}),
	};

	pi.registerProvider(PROVIDER_NAME, config);
}

/**
 * Discover framearch models from the llama.cpp server and register them.
 * Deduplicates concurrent calls via a shared promise.
 */
async function discoverModels(
	pi: ExtensionAPI,
): Promise<DiscoveredModel[] | undefined> {
	if (discoveryPromise) {
		return discoveryPromise;
	}

	discoveryPromise = (async () => {
		try {
			const response = await fetch(DISCOVERY_URL, {
				signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
			});
			if (!response.ok) {
				console.warn(
					`[framearch-autodiscover] Server returned ${response.status}, skipping dynamic registration`,
				);
				return undefined;
			}

			const payload = (await response.json()) as {
				data: LlamaCppModel[];
			};

			const models = payload.data.map((model) => {
				const reasoning = supportsLlamaCppThinking(model.id);

				return {
					id: model.id,
					name: model.id
						.replace(/-/g, " ")
						.replace(/\b\w/g, (c) => c.toUpperCase()),
					reasoning,
					thinkingLevelMap: reasoning ? {} : undefined,
					input: getInputModalities(model),
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: getContextWindow(model),
					maxTokens: Number(process.env.FRAMEARCH_MAX_TOKENS) || 16384,
					compat: FRAMEARCH_COMPAT,
				};
			});

			discoveredModels = models;
			registerFramearchProvider(pi, models);

			console.log(
				`[framearch-autodiscover] Discovered ${models.length} models from llama.cpp server`,
			);
			return models;
		} catch (err: any) {
			const cause = err.cause?.code || err.code || err.message || "unknown";
			console.warn(
				`[framearch-autodiscover] Discovery failed (${cause})`,
			);
			return undefined;
		} finally {
			discoveryPromise = undefined;
		}
	})();

	return discoveryPromise;
}

/**
 * Fire-and-forget discovery helper for non-blocking event handlers.
 */
function triggerDiscovery(pi: ExtensionAPI): void {
	discoverModels(pi).catch(() => {
		// Swallow errors — they are already logged in discoverModels
	});
}

export default async function (pi: ExtensionAPI) {
	// Discover during extension startup so framearch models are available to
	// normal startup paths, /model, and `pi --list-models`.
	const startupModels = await discoverModels(pi);

	// If the server is unavailable, still register the provider shell so an
	// already-selected framearch model can route requests and later retry
	// discovery via events or /models.
	if (!startupModels) {
		registerFramearchProvider(pi);
	}

	// Trigger discovery when a framearch model is selected (e.g. restored from
	// session state, cycled via keyboard shortcut, or set via command).
	pi.on("model_select", async (event, _ctx) => {
		if (event.model.provider === PROVIDER_NAME) {
			triggerDiscovery(pi);
		}
	});

	// Refresh discovery at session start unconditionally so framearch models
	// are always available for selection. Fire-and-forget, non-blocking.
	pi.on("session_start", async (_event, ctx) => {
		triggerDiscovery(pi);

		// Show available models only if already discovered
		if (discoveredModels) {
			const modelList = discoveredModels.map((m) => `• ${m.name}`).join("\n");
			ctx.ui.notify(
				`framearch: ${discoveredModels.length} models available\n${modelList}`,
				"info",
			);
		}
	});

	// Safety net: if a request is about to be sent to a framearch model and
	// models haven't been discovered yet, trigger discovery in the background.
	// The request proceeds with the already-selected model — the provider config
	// (baseUrl, apiKey) is already registered, so the API call works regardless.
	pi.on("before_provider_request", async (event, ctx) => {
		if (ctx.model?.provider === PROVIDER_NAME) {
			triggerDiscovery(pi);

			if (supportsLlamaCppThinking(ctx.model.id)) {
				applyLlamaCppThinkingPayload(
					ctx.model.id,
					event.payload,
					pi.getThinkingLevel() as ThinkingLevel,
				);
			}
		}
	});

	// Register /models command to trigger discovery and list available models.
	// Awaits discovery so the user sees the result immediately.
	pi.registerCommand("models", {
		description: "List available framearch models",
		handler: async (_args, ctx) => {
			await discoverModels(pi);

			if (!discoveredModels) {
				ctx.ui.notify(
					"framearch: No models discovered. Server may be unavailable.",
					"warning",
				);
				return;
			}

			const modelList = discoveredModels
				.map((m, i) => `${i + 1}. ${m.name} (${m.id})`)
				.join("\n");
			ctx.ui.notify(
				`Available framearch models:\n${modelList}`,
				"info",
			);
		},
	});

	console.log(`[framearch-autodiscover] Provider registered`);
}
