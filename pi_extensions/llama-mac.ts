import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const baseUrl = "http://localhost:8080/v1";

  // Fetch models asynchronously and register
  fetch(`${baseUrl}/models`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || !Array.isArray(data.data)) {
        console.warn(`[local-server] Invalid response from ${baseUrl}/models`);
        return;
      }

      const models = data.data.map((m: any) => ({
        id: m.id,
        name: m.id,
        reasoning: false, // Set to true if your local models support extended thinking
        input: ["text"],
        contextWindow: 128000, // Adjust defaults if necessary
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        // Add compat options if your server struggles with OpenAI quirks (like developer role)
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
        },
      }));

      pi.registerProvider("mac-local", {
        baseUrl,
        api: "openai-completions",
        apiKey: "dummy", // A key is required by config but ignored by local unauthenticated servers
        models,
      });
    })
    .catch(() => {
      // Server isn't up — that's fine, just don't register the provider.
    });
}

