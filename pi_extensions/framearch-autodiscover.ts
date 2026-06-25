import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── framearch (packaged llama.cpp on port 8000) ────────────────────

const FRAMEARCH_PROVIDER = "framearch";
const FRAMEARCH_DISCOVERY_URL = "http://framearch-juan:8000/v1/models";
const FRAMEARCH_API_BASE_URL = "http://framearch-juan:8000/v1";

// ── CachyLLama (fork on port 9092) ─────────────────────────────────

const CACHY_PROVIDER = "cachy";
const CACHY_DISCOVERY_URL = "http://127.0.0.1:9092/v1/models";
const CACHY_API_BASE_URL = "http://127.0.0.1:9092/v1";

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
let discoveredFramearchModels: DiscoveredModel[] | undefined;
let discoveredCachyModels: DiscoveredModel[] | undefined;

/** In-flight discovery promises (deduplicates concurrent requests) */
let framearchDiscoveryPromise: Promise<DiscoveredModel[] | undefined> | undefined;
let cachyDiscoveryPromise: Promise<DiscoveredModel[] | undefined> | undefined;

function registerFramearchProvider(
	pi: ExtensionAPI,
	models?: DiscoveredModel[],
): void {
	pi.registerProvider(FRAMEARCH_PROVIDER, {
		baseUrl: FRAMEARCH_API_BASE_URL,
		apiKey: "local",
		api: "openai-completions" as const,
		compat: FRAMEARCH_COMPAT,
		...(models ? { models } : {}),
	});
}

function registerCachyProvider(
	pi: ExtensionAPI,
	models?: DiscoveredModel[],
): void {
	pi.registerProvider(CACHY_PROVIDER, {
		baseUrl: CACHY_API_BASE_URL,
		apiKey: "pi",
		api: "openai-completions" as const,
		compat: FRAMEARCH_COMPAT,
		...(models ? { models } : {}),
	});
}

/**
 * Fetch model list from a llama.cpp /v1/models endpoint and convert to
 * DiscoveredModel[].
 */
async function fetchModelsFrom(url: string): Promise<DiscoveredModel[] | undefined> {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
		});
		if (!response.ok) return undefined;

		const payload = (await response.json()) as { data: LlamaCppModel[] };

		return payload.data.map((model) => {
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
	} catch {
		return undefined;
	}
}

/**
 * Discover framearch models (port 8000) and register them.
 */
async function discoverFramearch(
	pi: ExtensionAPI,
): Promise<DiscoveredModel[] | undefined> {
	if (framearchDiscoveryPromise) return framearchDiscoveryPromise;

	framearchDiscoveryPromise = (async () => {
		const models = await fetchModelsFrom(FRAMEARCH_DISCOVERY_URL);
		if (models) {
			discoveredFramearchModels = models;
			registerFramearchProvider(pi, models);
		} else {
			console.warn("[framearch-autodiscover] framearch server unavailable");
		}
		return models;
	})().finally(() => { framearchDiscoveryPromise = undefined; });

	return framearchDiscoveryPromise;
}

/**
 * Discover CachyLLama models (port 9092) and register them.
 */
async function discoverCachy(
	pi: ExtensionAPI,
): Promise<DiscoveredModel[] | undefined> {
	if (cachyDiscoveryPromise) return cachyDiscoveryPromise;

	cachyDiscoveryPromise = (async () => {
		const models = await fetchModelsFrom(CACHY_DISCOVERY_URL);
		if (models) {
			discoveredCachyModels = models;
			registerCachyProvider(pi, models);
		} else {
			console.warn("[framearch-autodiscover] CachyLLama server unavailable");
		}
		return models;
	})().finally(() => { cachyDiscoveryPromise = undefined; });

	return cachyDiscoveryPromise;
}

/**
 * Fire-and-forget discovery for both providers.
 */
function triggerDiscovery(pi: ExtensionAPI): void {
	discoverFramearch(pi).catch(() => {});
	discoverCachy(pi).catch(() => {});
}

export default async function (pi: ExtensionAPI) {
	// Discover both servers at startup.
	const [framearchModels, cachyModels] = await Promise.all([
		discoverFramearch(pi),
		discoverCachy(pi),
	]);

	// Register provider shells even if discovery failed, so already-selected
	// models can still route requests and retry discovery later.
	if (!framearchModels) registerFramearchProvider(pi);
	if (!cachyModels) registerCachyProvider(pi);

	// ── Event handlers (both providers) ────────────────────────────

	const isLlamaProvider = (name: string) =>
		name === FRAMEARCH_PROVIDER || name === CACHY_PROVIDER;

	pi.on("model_select", async (event, _ctx) => {
		if (isLlamaProvider(event.model.provider)) {
			triggerDiscovery(pi);
		}
	});

	pi.on("session_start", async (_event, _ctx) => {
		triggerDiscovery(pi);
	});

	pi.on("before_provider_request", async (event, ctx) => {
		if (isLlamaProvider(ctx.model?.provider ?? "")) {
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

	// ── /models command ────────────────────────────────────────────

	pi.registerCommand("models", {
		description: "List available local models (framearch + CachyLLama)",
		handler: async (_args, ctx) => {
			const [framearch, cachy] = await Promise.all([
				discoverFramearch(pi),
				discoverCachy(pi),
			]);

			const lines: string[] = [];
			if (framearch) {
				lines.push("─ framearch (port 8000) ─");
				framearch.forEach((m, i) => lines.push(`  ${i + 1}. ${m.name} (${m.id})`));
			} else {
				lines.push("─ framearch (port 8000) ─ unavailable");
			}
			if (cachy) {
				lines.push("─ CachyLLama (port 9092) ─");
				cachy.forEach((m, i) => lines.push(`  ${i + 1}. ${m.name} (${m.id})`));
			} else {
				lines.push("─ CachyLLama (port 9092) ─ unavailable");
			}

			if (!framearch && !cachy) {
				ctx.ui.notify(
					"No local models discovered. Both servers may be unavailable.",
					"warning",
				);
				return;
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// No startup banner — models are discovered silently
}
