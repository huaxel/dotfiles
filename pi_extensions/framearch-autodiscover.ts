import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── framearch (packaged llama.cpp on port 8000) ────────────────────

const FRAMEARCH_PROVIDER = "framearch";
const FRAMEARCH_DISCOVERY_URL = "http://framearch-juan:8000/v1/models";
const FRAMEARCH_API_BASE_URL = "http://framearch-juan:8000/v1";

// ── CachyLLama (fork on port 9092) ─────────────────────────────────

const CACHY_PROVIDER = "cachy";
const CACHY_DISCOVERY_URL = "http://framearch-juan:9092/v1/models";
const CACHY_API_BASE_URL = "http://framearch-juan:9092/v1";

const DISCOVERY_TIMEOUT_MS = Number(process.env.FRAMEARCH_DISCOVERY_TIMEOUT_MS) || 5000;

// ── Status icons (Nerd Font — JetBrainsMono NF) ────────────────────

const STATUS_ICON = {
	loaded: "󰐊",   // nf-md-play
	loading: "󰑐",  // nf-md-sync
	error: "󰅚",    // nf-md-alert
	unloaded: "󰏤", // nf-md-pause
	unknown: "󰋗",  // nf-md-help
} as const;

const FRAMEARCH_COMPAT = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
	thinkingFormat: "qwen" as const,
	maxTokensField: "max_tokens" as const,
};

const LLAMA_THINKING_LEVEL_MAP = {
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "max",
} satisfies Partial<Record<ThinkingLevel, string | null>>;

const LLAMA_THINKING_BUDGET_TOKENS = {
	minimal: 512,
	low: 512,
	medium: 2048,
	high: 8192,
	xhigh: undefined,
} satisfies Partial<Record<Exclude<ThinkingLevel, "off">, number | undefined>>;

type InputModality = "text" | "image";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
type ModelLoadStatus = "loaded" | "unloaded" | "loading" | "error" | "unknown";

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
	loadStatus?: ModelLoadStatus;
	provider?: string;
};

type LlamaCppModel = {
	id: string;
	status?: {
		args?: string[];
		value?: ModelLoadStatus;
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

function getModelLoadStatus(model: LlamaCppModel): ModelLoadStatus {
	return model.status?.value ?? "unknown";
}

// llama.cpp exposes reasoning with the same knobs as its bundled UI:
//   off, low (512 tokens), medium (2048), high (8192), max (unlimited).
// Pi's normalized thinking levels are translated here at the provider layer.
function applyLlamaCppThinkingPayload(payload: unknown, thinkingLevel: ThinkingLevel): void {
	if (!payload || typeof payload !== "object") return;

	const request = payload as {
		enable_thinking?: boolean;
		thinking_budget_tokens?: number;
	};

	if (thinkingLevel === "off") {
		request.enable_thinking = false;
		delete request.thinking_budget_tokens;
		return;
	}

	request.enable_thinking = true;
	const budget = LLAMA_THINKING_BUDGET_TOKENS[thinkingLevel];
	if (budget === undefined) {
		delete request.thinking_budget_tokens;
	} else {
		request.thinking_budget_tokens = budget;
	}
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

type PostResult =
	| { ok: true; status: number }
	| { ok: false; status: number; text: string };

/**
 * POST to a llama.cpp endpoint (load/unload).
 */
async function postToLlamaCpp(
	baseUrl: string,
	path: string,
	body: Record<string, unknown>,
): Promise<PostResult> {
	try {
		const url = baseUrl.replace(/\/$/, "") + path;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS * 2),
		});
		if (response.ok) {
			return { ok: true, status: response.status };
		}
		const text = await response.text();
		return { ok: false, status: response.status, text };
	} catch (err) {
		return { ok: false, status: 0, text: String(err) };
	}
}

/**
 * Load a model on the llama.cpp server.
 */
async function loadModel(
	provider: string,
	modelId: string,
): Promise<PostResult> {
	const baseUrl =
		provider === FRAMEARCH_PROVIDER
			? FRAMEARCH_API_BASE_URL
			: CACHY_API_BASE_URL;
	return postToLlamaCpp(baseUrl, "/models/load", { model: modelId });
}

/**
 * Unload a model (or all models if modelId is omitted) from the llama.cpp server.
 */
async function unloadModel(
	provider: string,
	modelId?: string,
): Promise<PostResult> {
	const baseUrl =
		provider === FRAMEARCH_PROVIDER
			? FRAMEARCH_API_BASE_URL
			: CACHY_API_BASE_URL;
	const body: Record<string, unknown> = modelId ? { model: modelId } : {};
	return postToLlamaCpp(baseUrl, "/models/unload", body);
}

/**
 * Find a model by exact ID first, then by partial ID.
 */
function findModelByTarget(
	models: DiscoveredModel[],
	target: string,
): DiscoveredModel | undefined {
	const exact = models.find((m) => m.id === target);
	if (exact) return exact;
	const lower = target.toLowerCase();
	return models.find((m) => m.id.toLowerCase().includes(lower));
}

/**
 * Fetch model list from a llama.cpp /v1/models endpoint and convert to
 * DiscoveredModel[].
 */
async function fetchModelsFrom(
	url: string,
	provider: string,
): Promise<DiscoveredModel[] | undefined> {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
		});
		if (!response.ok) return undefined;

		const payload = (await response.json()) as { data: LlamaCppModel[] };

		return payload.data.map((model) => ({
			id: model.id,
			name: model.id
				.replace(/-/g, " ")
				.replace(/\b\w/g, (c) => c.toUpperCase()),
			reasoning: true,
			thinkingLevelMap: LLAMA_THINKING_LEVEL_MAP,
			input: getInputModalities(model),
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: getContextWindow(model),
			maxTokens: Number(process.env.FRAMEARCH_MAX_TOKENS) || 16384,
			compat: FRAMEARCH_COMPAT,
			loadStatus: getModelLoadStatus(model),
			provider,
		}));
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
		const models = await fetchModelsFrom(FRAMEARCH_DISCOVERY_URL, FRAMEARCH_PROVIDER);
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
		const models = await fetchModelsFrom(CACHY_DISCOVERY_URL, CACHY_PROVIDER);
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
		const provider = ctx.model?.provider ?? "";
		if (!isLlamaProvider(provider)) return;

		triggerDiscovery(pi);
		applyLlamaCppThinkingPayload(
			event.payload,
			pi.getThinkingLevel() as ThinkingLevel,
		);

		// Pre-load unloaded models in router mode (fire-and-forget; router also
		// auto-loads on demand, this just warms it up without blocking the request).
		const modelId = ctx.model?.id;
		if (modelId) {
			const models =
				provider === FRAMEARCH_PROVIDER
					? discoveredFramearchModels
					: discoveredCachyModels;
			const model = models?.find((m) => m.id === modelId);
			if (model && model.loadStatus === "unloaded") {
				console.warn(
					`[framearch-autodiscover] pre-loading ${modelId}...`,
				);
				loadModel(provider, modelId).catch(() => {
					// Router will still load on-demand if this fails.
				});
			}
		}
	});

	// ── /models command ────────────────────────────────────────────

	pi.registerCommand("models", {
		description: "List, load, unload, or switch local models (framearch + CachyLLama)",
		getArgumentCompletions: (prefix: string) => {
			const subcommands = [
				{ value: "", label: "(list)", description: "List all models" },
				{ value: "info", label: "info", description: "Show model details" },
				{ value: "load", label: "load", description: "Load a model" },
				{ value: "unload", label: "unload", description: "Unload a model (or all)" },
				{ value: "switch", label: "switch", description: "Switch to a loaded model" },
			];
			const filtered = subcommands.filter((s) =>
				s.value.startsWith(prefix),
			);
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const [framearch, cachy] = await Promise.all([
				discoverFramearch(pi),
				discoverCachy(pi),
			]);

			const allModels = [
				...(framearch ?? []),
				...(cachy ?? []),
			];

			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] || "";
			const target = parts.slice(1).join(" ");

			// ── /models info ──
			if (subcommand === "info") {
				if (allModels.length === 0) {
					ctx.ui.notify("No models discovered.", "warning");
					return;
				}
				const lines: string[] = ["── Model Info ──"];
				for (const m of allModels) {
					const status = m.loadStatus ?? "unknown";
					const icon = STATUS_ICON[status] ?? STATUS_ICON.unknown;
					lines.push(
						`${icon} ${m.name}`,
						`   id: ${m.id}`,
						`   provider: ${m.provider ?? "?"}`,
						`   status: ${status}`,
						`   context: ${m.contextWindow.toLocaleString()}`,
						`   modalities: ${m.input.join(", ")}`,
						"",
					);
				}
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			// ── /models load <name> ──
			if (subcommand === "load") {
				if (!target) {
					ctx.ui.notify("Usage: /models load <model-id>", "warning");
					return;
				}
				const match = findModelByTarget(allModels, target);
				if (!match) {
					ctx.ui.notify(`Model "${target}" not found.`, "warning");
					return;
				}
				if (match.loadStatus === "loaded") {
					ctx.ui.notify(`"${match.name}" is already loaded.`, "info");
					return;
				}
				ctx.ui.notify(`Loading ${match.name}...`, "info");
				const result = await loadModel(match.provider!, match.id);
				if (result.ok) {
					triggerDiscovery(pi);
					ctx.ui.notify(`Loaded ${match.name}.`, "info");
				} else {
					console.warn(
						`[framearch-autodiscover] load ${match.id} failed:`,
						result.status,
						result.text,
					);
					ctx.ui.notify(
						`Failed to load ${match.name} (${result.status}).`,
						"warning",
					);
				}
				return;
			}

			// ── /models unload [name] ──
			if (subcommand === "unload") {
				if (target) {
					const match = findModelByTarget(allModels, target);
					if (!match) {
						ctx.ui.notify(`Model "${target}" not found.`, "warning");
						return;
					}
					ctx.ui.notify(`Unloading ${match.name}...`, "info");
					const result = await unloadModel(match.provider!, match.id);
					if (result.ok) {
						triggerDiscovery(pi);
						ctx.ui.notify(`${match.name} unloaded.`, "info");
					} else {
						console.warn(
							`[framearch-autodiscover] unload ${match.id} failed:`,
							result.status,
							result.text,
						);
						ctx.ui.notify(
							`Failed to unload ${match.name} (${result.status}).`,
							"warning",
						);
					}
				} else {
					// Unload all from both servers
					ctx.ui.notify("Unloading all models...", "info");
						const [r1, r2] = await Promise.all([
						unloadModel(FRAMEARCH_PROVIDER),
						unloadModel(CACHY_PROVIDER),
					]);
					triggerDiscovery(pi);
					const anyOk = r1.ok || r2.ok;
					ctx.ui.notify(
						anyOk ? "All models unloaded." : "Unload failed.",
						"info",
					);
				}
				return;
			}

			// ── /models switch <name> ──
			if (subcommand === "switch") {
				if (!target) {
					ctx.ui.notify("Usage: /models switch <model-id>", "warning");
					return;
				}
				const match = findModelByTarget(allModels, target);
				if (!match) {
					ctx.ui.notify(`Model "${target}" not found.`, "warning");
					return;
				}
				if (match.loadStatus !== "loaded") {
					ctx.ui.notify(
						`"${match.name}" is not loaded (status: ${match.loadStatus ?? "unknown"}). Use /models load first.`,
						"warning",
					);
					return;
				}
				const model = ctx.modelRegistry.find(match.provider!, match.id);
				if (!model) {
					ctx.ui.notify(
						`Model "${match.name}" is not available in the registry; try \`/reload\`.`,
						"warning",
					);
					return;
				}
				const ok = await pi.setModel(model);
				ctx.ui.notify(
					ok ? `Switched to ${match.name}.` : `Failed to switch to ${match.name}.`,
					ok ? "info" : "warning",
				);
				return;
			}

			// ── /models (list) ──
			const lines: string[] = [];
			if (framearch) {
				lines.push("─ framearch (port 8000) ─");
				framearch.forEach((m, i) => {
					const status = m.loadStatus ?? "unknown";
					const icon = STATUS_ICON[status] ?? STATUS_ICON.unknown;
					lines.push(`  ${icon} ${i + 1}. ${m.name} (${m.id})`);
				});
			} else {
				lines.push("─ framearch (port 8000) ─ unavailable");
			}
			if (cachy) {
				lines.push("─ CachyLLama (port 9092) ─");
				cachy.forEach((m, i) => {
					const status = m.loadStatus ?? "unknown";
					const icon = STATUS_ICON[status] ?? STATUS_ICON.unknown;
					lines.push(`  ${icon} ${i + 1}. ${m.name} (${m.id})`);
				});
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

			lines.push("");
			lines.push("Subcommands: info, load <id>, unload [id], switch <id>");

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// No startup banner — models are discovered silently
}
