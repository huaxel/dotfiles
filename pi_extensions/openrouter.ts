import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  // We'll fetch models from the OpenRouter API
  const OPENROUTER_URL = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1";
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "your-openrouter-key";

  if (OPENROUTER_KEY === "your-openrouter-key") {
    // console.warn("[openrouter-dynamic] Missing OPENROUTER_API_KEY, skipping dynamic model fetch.");
    // return;
  }

  try {
    const response = await fetch(`${OPENROUTER_URL}/models`, {
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      
      const models = data.data.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        reasoning: false,
        input: model.architecture?.modality === "text+image" ? ["text", "image"] : ["text"],
        contextWindow: model.context_length || 128000,
        maxTokens: model.top_provider?.max_completion_tokens || 4096,
        cost: { 
          input: (model.pricing?.prompt || 0) * 1_000_000, 
          output: (model.pricing?.completion || 0) * 1_000_000, 
          cacheRead: 0, 
          cacheWrite: 0 
        }
      }));

      // We can map these to a custom openrouter provider
      // Or we can register a completely new provider like `openrouter-dynamic`
      pi.registerProvider("openrouter-dynamic", {
        baseUrl: OPENROUTER_URL,
        apiKey: OPENROUTER_KEY,
        api: "openai-completions",
        models: models
      });
      
    } else {
      console.error(`[openrouter-dynamic] Failed to fetch models: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`[openrouter-dynamic] Error fetching models from openrouter:`, error);
  }
}
