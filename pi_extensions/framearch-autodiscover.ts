import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_NAME = "framearch";
const DISCOVERY_URL = "http://framearch-juan:8000/v1/models";
const API_BASE_URL = "http://framearch-juan:55268/v1";

type DiscoveredModel = {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
};

/** Cached discovered models */
let discoveredModels: DiscoveredModel[] | undefined;

/** In-flight discovery promise (deduplicates concurrent requests) */
let discoveryPromise: Promise<void> | undefined;

/**
 * Discover framearch models from the llama.cpp server and register them.
 * Deduplicates concurrent calls via a shared promise.
 */
async function discoverModels(pi: ExtensionAPI): Promise<void> {
	if (discoveryPromise) {
		return discoveryPromise;
	}

	discoveryPromise = (async () => {
		try {
			const response = await fetch(DISCOVERY_URL);
			if (!response.ok) {
				console.warn(
					`[framearch-autodiscover] Server returned ${response.status}, skipping dynamic registration`,
				);
				return;
			}

			const payload = (await response.json()) as {
				data: Array<{ id: string }>;
			};

			const models = payload.data.map((model) => ({
				id: model.id,
				name: model.id
					.replace(/-/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase()),
				reasoning: false,
				input: ["text"] as ("text" | "image")[],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: Number(process.env.FRAMEARCH_CTX) || 65536,
				maxTokens: Number(process.env.FRAMEARCH_MAX_TOKENS) || 16384,
			}));

			discoveredModels = models;

			pi.registerProvider(PROVIDER_NAME, {
				baseUrl: API_BASE_URL,
				apiKey: "local",
				api: "openai-completions",
				models,
			});

			console.log(
				`[framearch-autodiscover] Discovered ${models.length} models from llama.cpp server`,
			);
		} catch (err: any) {
			const cause = err.cause?.code || err.code || err.message || "unknown";
			console.warn(
				`[framearch-autodiscover] Discovery failed (${cause})`,
			);
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
	// Register provider with minimal config immediately — no blocking fetch.
	// The provider is available for API key resolution and baseUrl routing,
	// but no models appear in the model list until discovery completes.
	pi.registerProvider(PROVIDER_NAME, {
		baseUrl: API_BASE_URL,
		apiKey: "local",
		api: "openai-completions",
	});

	// Trigger discovery when a framearch model is selected (e.g. restored from
	// session state, cycled via keyboard shortcut, or set via command).
	pi.on("model_select", async (event, _ctx) => {
		if (event.model.provider === PROVIDER_NAME) {
			triggerDiscovery(pi);
		}
	});

	// Trigger discovery at session start if the current model is framearch.
	// Fire-and-forget so session startup is not blocked.
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.model?.provider === PROVIDER_NAME) {
			triggerDiscovery(pi);
		}

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
	pi.on("before_provider_request", async (_event, ctx) => {
		if (ctx.model?.provider === PROVIDER_NAME) {
			triggerDiscovery(pi);
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

	console.log(`[framearch-autodiscover] Provider registered (lazy discovery)`);
}
