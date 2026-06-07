import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
	try {
		const response = await fetch("http://framearch-juan:8000/v1/models");
		if (!response.ok) {
			console.warn(`[framearch-autodiscover] Server returned ${response.status}, skipping dynamic registration`);
			return;
		}

		const payload = (await response.json()) as {
			data: Array<{ id: string }>;
		};

		const models = payload.data.map((model) => ({
			id: model.id,
			name: model.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
			reasoning: false,
			input: ["text"] as ("text" | "image")[],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: Number(process.env.FRAMEARCH_CTX) || 65536,
			maxTokens: Number(process.env.FRAMEARCH_MAX_TOKENS) || 16384,
		}));

		pi.registerProvider("framearch", {
			baseUrl: "http://framearch-juan:55268/v1",
			apiKey: "local",
			api: "openai-completions",
			models,
		});

		// Show available models on session start
		pi.on("session_start", async (_event, ctx) => {
			const modelList = models.map((m) => `• ${m.name}`).join("\n");
			ctx.ui.notify(
				`framearch: ${models.length} models available\n${modelList}`,
				"info"
			);
		});

		// Register /models command to list available models
		pi.registerCommand("models", {
			description: "List available framearch models",
			handler: async (_args, ctx) => {
				const modelList = models.map((m, i) => `${i + 1}. ${m.name} (${m.id})`).join("\n");
				ctx.ui.notify(
					`Available framearch models:\n${modelList}`,
					"info"
				);
			},
		});

		console.log(`[framearch-autodiscover] Registered ${models.length} models from llama.cpp server`);
	} catch (err: any) {
		const cause = err.cause?.code || err.code || err.message || "unknown";
		console.warn(`[framearch-autodiscover] Server unavailable (${cause}), skipping dynamic registration`);
	}
}
