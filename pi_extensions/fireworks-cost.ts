import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let modelsDevPricing: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> | null = null;

async function fetchModelsDevPricing(): Promise<typeof modelsDevPricing> {
  if (modelsDevPricing) return modelsDevPricing;
  try {
    const res = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    modelsDevPricing = {};
    for (const provider of Object.values(data)) {
      if (!provider?.models) continue;
      for (const [id, model] of Object.entries(provider.models)) {
        if ((model as any).cost) {
          modelsDevPricing[id] = {
            input: (model as any).cost.input ?? 0,
            output: (model as any).cost.output ?? 0,
            cacheRead: (model as any).cost.cache_read ?? 0,
            cacheWrite: (model as any).cost.cache_write ?? 0,
          };
        }
      }
    }
    return modelsDevPricing;
  } catch {
    return null;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    await fetchModelsDevPricing();
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    const model = event.message.model;
    const usage = event.message.usage;
    if (!usage || !model) return;
    if (usage.cost?.total !== 0) return;

    let cost: { input: number; output: number; cacheRead: number; cacheWrite: number } | undefined;

    // Try model registry first (if user added cost to models.json)
    const provider = event.message.provider;
    const modelId = model.replace("[pi] ", "");
    if (provider && ctx.modelRegistry?.find) {
      const registryModel = ctx.modelRegistry.find(provider, modelId);
      if (registryModel?.cost) {
        cost = registryModel.cost;
      }
    }

    // Fallback to models.dev
    if (!cost && modelsDevPricing) {
      cost = modelsDevPricing[modelId];
    }

    if (!cost) return;

    const inputCost = (usage.input * cost.input) / 1_000_000;
    const outputCost = (usage.output * cost.output) / 1_000_000;
    const cacheReadCost = (usage.cacheRead * cost.cacheRead) / 1_000_000;
    const cacheWriteCost = (usage.cacheWrite * cost.cacheWrite) / 1_000_000;
    const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    return {
      message: {
        ...event.message,
        usage: {
          ...usage,
          cost: {
            input: inputCost,
            output: outputCost,
            cacheRead: cacheReadCost,
            cacheWrite: cacheWriteCost,
            total,
          },
        },
      },
    };
  });
}
