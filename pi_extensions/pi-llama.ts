import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Configuration ────────────────────────────────────────────────────────

const PROVIDER = "llamacpp";
const HOST = process.env.PI_LLAMA_HOST || "framearch-juan";
const PORT = Number(process.env.PI_LLAMA_PORT) || 8000;
const DISCOVERY_URL = `http://${HOST}:${PORT}/v1/models`;
const API_BASE_URL = `http://${HOST}:${PORT}/v1`;
const ROOT_URL = `http://${HOST}:${PORT}`; // load/unload at root, not /v1

const DISCOVERY_TIMEOUT_MS =
  Number(process.env.PI_LLAMA_TIMEOUT_MS) || 30000;

// ── Types ────────────────────────────────────────────────────────────────

type InputModality = "text" | "image";
type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";
type ModelLoadStatus = "loaded" | "unloaded" | "loading" | "error" | "unknown";

interface LlamaCppModel {
  id: string;
  status?: {
    args?: string[];
    value?: ModelLoadStatus;
  };
  architecture?: {
    input_modalities?: string[];
  };
}

interface DiscoveredModel {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap: Partial<Record<ThinkingLevel, string | null>>;
  input: InputModality[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: {
    supportsDeveloperRole: boolean;
    supportsReasoningEffort: boolean;
    thinkingFormat: "qwen";
    maxTokensField: "max_tokens";
  };
  loadStatus: ModelLoadStatus;
  provider: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const STATUS_ICON: Record<ModelLoadStatus, string> = {
  loaded: "󰐊",
  loading: "󰑐",
  error: "󰅚",
  unloaded: "󰏤",
  unknown: "󰋗",
};

const COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  thinkingFormat: "qwen" as const,
  maxTokensField: "max_tokens" as const,
};

// llama.cpp thinking: off / low (512) / medium (2048) / high (8192) / max (∞)
const THINKING_LEVEL_MAP: Partial<Record<ThinkingLevel, string | null>> = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "max",
};

const THINKING_BUDGET_TOKENS: Record<Exclude<ThinkingLevel, "off">, number | undefined> =
  {
    minimal: 512,
    low: 512,
    medium: 2048,
    high: 8192,
    xhigh: undefined,
  };

// ── Helpers ──────────────────────────────────────────────────────────────

function getArgNumber(
  args: string[] | undefined,
  name: string,
): number | undefined {
  const index = args?.indexOf(name) ?? -1;
  if (index < 0) return undefined;
  const value = Number(args?.[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}

function getContextWindow(model: LlamaCppModel): number {
  const envCtx = Number(process.env.PI_LLAMA_CTX);
  return (
    getArgNumber(model.status?.args, "--ctx-size") ??
    (Number.isFinite(envCtx) && envCtx > 0 ? envCtx : 128_000)
  );
}

function getInputModalities(model: LlamaCppModel): InputModality[] {
  const mods = model.architecture?.input_modalities ?? [];
  return mods.includes("image") ? ["text", "image"] : ["text"];
}

function getModelLoadStatus(model: LlamaCppModel): ModelLoadStatus {
  return model.status?.value ?? "unknown";
}

/**
 * Translate Pi's thinking level to llama.cpp thinking payload.
 * llama.cpp uses enable_thinking + thinking_budget_tokens.
 */
function applyThinkingPayload(
  payload: unknown,
  thinkingLevel: ThinkingLevel,
): void {
  if (!payload || typeof payload !== "object") return;

  const req = payload as {
    enable_thinking?: boolean;
    thinking_budget_tokens?: number;
  };

  if (thinkingLevel === "off") {
    req.enable_thinking = false;
    delete req.thinking_budget_tokens;
    return;
  }

  req.enable_thinking = true;
  const budget = THINKING_BUDGET_TOKENS[thinkingLevel];
  if (budget === undefined) {
    delete req.thinking_budget_tokens;
  } else {
    req.thinking_budget_tokens = budget;
  }
}

// ── State ────────────────────────────────────────────────────────────────

let discoveredModels: DiscoveredModel[] | undefined;
let discoveryPromise: Promise<DiscoveredModel[] | undefined> | undefined;

// ── Discovery ────────────────────────────────────────────────────────────

function registerProvider(pi: ExtensionAPI, models?: DiscoveredModel[]): void {
  pi.registerProvider(PROVIDER, {
    baseUrl: API_BASE_URL,
    apiKey: "local",
    api: "openai-completions" as const,
    compat: COMPAT,
    ...(models ? { models } : {}),
  });
}

async function fetchModels(
  url: string,
  provider: string,
): Promise<DiscoveredModel[] | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;

    const payload = (await res.json()) as { data: LlamaCppModel[] };

    return payload.data.map((m) => ({
      id: m.id,
      name: m.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      reasoning: true,
      thinkingLevelMap: THINKING_LEVEL_MAP,
      input: getInputModalities(m),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: getContextWindow(m),
      maxTokens: Number(process.env.PI_LLAMA_MAX_TOKENS) || 16_384,
      compat: COMPAT,
      loadStatus: getModelLoadStatus(m),
      provider,
    }));
  } catch {
    return undefined;
  }
}

async function discover(pi: ExtensionAPI): Promise<DiscoveredModel[] | undefined> {
  if (discoveryPromise) return discoveryPromise;

  discoveryPromise = (async () => {
    const models = await fetchModels(DISCOVERY_URL, PROVIDER);
    if (models) {
      discoveredModels = models;
      registerProvider(pi, models);
    } else {
      console.warn("[pi-llama] server unavailable at", ROOT_URL);
    }
    return models;
  })().finally(() => {
    discoveryPromise = undefined;
  });

  return discoveryPromise;
}

function triggerDiscovery(pi: ExtensionAPI): void {
  discover(pi).catch(() => {});
}

// ── Model management ─────────────────────────────────────────────────────

type PostResult =
  | { ok: true; status: number }
  | { ok: false; status: number; text: string };

async function postLlama(
  path: string,
  body: Record<string, unknown>,
): Promise<PostResult> {
  try {
    const url = ROOT_URL.replace(/\/$/, "") + path;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS * 2),
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, text: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, text: String(err) };
  }
}

async function loadModel(modelId: string): Promise<PostResult> {
  return postLlama("/models/load", { model: modelId });
}

async function unloadModel(modelId?: string): Promise<PostResult> {
  return postLlama("/models/unload", modelId ? { model: modelId } : {});
}

function findModel(models: DiscoveredModel[], target: string): DiscoveredModel | undefined {
  const exact = models.find((m) => m.id === target);
  if (exact) return exact;
  const lower = target.toLowerCase();
  return models.find((m) => m.id.toLowerCase().includes(lower));
}

// ── Extension ────────────────────────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  // Startup discovery
  const models = await discover(pi);
  if (!models) registerProvider(pi); // shell so existing selections still route

  const isLlama = (name: string) => name === PROVIDER;

  // ── Events ──────────────────────────────────────────────────────────

  pi.on("model_select", async (event) => {
    if (isLlama(event.model.provider)) triggerDiscovery(pi);
  });

  pi.on("session_start", () => {
    triggerDiscovery(pi);
  });

  pi.on("before_provider_request", async (event, ctx) => {
    const provider = ctx.model?.provider ?? "";
    if (!isLlama(provider)) return;

    triggerDiscovery(pi);
    applyThinkingPayload(event.payload, pi.getThinkingLevel() as ThinkingLevel);

    // Pre-load unloaded models (fire-and-forget; router auto-loads anyway)
    const modelId = ctx.model?.id;
    if (modelId) {
      const model = discoveredModels?.find((m) => m.id === modelId);
      if (model && model.loadStatus === "unloaded") {
        console.warn(`[pi-llama] pre-loading ${modelId}...`);
        loadModel(modelId).catch(() => {});
      }
    }
  });

  // ── /models command ─────────────────────────────────────────────────

  pi.registerCommand("models", {
    description: "List, load, unload, or switch local models",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "", label: "(list)", description: "List all models" },
        { value: "info", label: "info", description: "Show model details" },
        { value: "load", label: "load", description: "Load a model" },
        { value: "unload", label: "unload", description: "Unload a model (or all)" },
        { value: "switch", label: "switch", description: "Switch to a loaded model" },
      ];
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const allModels = await discover(pi) ?? [];
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0] || "";
      const target = parts.slice(1).join(" ");

      // ── /models info ──
      if (subcommand === "info") {
        if (allModels.length === 0) {
          ctx.ui.notify("No models discovered.", "warning");
          return;
        }
        const lines = ["── Model Info ──"];
        for (const m of allModels) {
          const status = m.loadStatus;
          const icon = STATUS_ICON[status] ?? STATUS_ICON.unknown;
          lines.push(
            `${icon} ${m.name}`,
            `   id: ${m.id}`,
            `   provider: ${m.provider}`,
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
        const match = findModel(allModels, target);
        if (!match) {
          ctx.ui.notify(`Model "${target}" not found.`, "warning");
          return;
        }
        if (match.loadStatus === "loaded") {
          ctx.ui.notify(`"${match.name}" is already loaded.`, "info");
          return;
        }
        ctx.ui.notify(`Loading ${match.name}...`, "info");
        const result = await loadModel(match.id);
        if (result.ok) {
          triggerDiscovery(pi);
          ctx.ui.notify(`Loaded ${match.name}.`, "info");
        } else {
          console.warn(`[pi-llama] load ${match.id} failed:`, result.status, result.text);
          ctx.ui.notify(`Failed to load ${match.name} (${result.status}).`, "warning");
        }
        return;
      }

      // ── /models unload [name] ──
      if (subcommand === "unload") {
        if (target) {
          const match = findModel(allModels, target);
          if (!match) {
            ctx.ui.notify(`Model "${target}" not found.`, "warning");
            return;
          }
          ctx.ui.notify(`Unloading ${match.name}...`, "info");
          const result = await unloadModel(match.id);
          if (result.ok) {
            triggerDiscovery(pi);
            ctx.ui.notify(`${match.name} unloaded.`, "info");
          } else {
            console.warn(`[pi-llama] unload ${match.id} failed:`, result.status, result.text);
            ctx.ui.notify(`Failed to unload ${match.name} (${result.status}).`, "warning");
          }
        } else {
          ctx.ui.notify("Unloading all models...", "info");
          const result = await unloadModel();
          triggerDiscovery(pi);
          ctx.ui.notify(result.ok ? "All models unloaded." : "Unload failed.", "info");
        }
        return;
      }

      // ── /models switch <name> ──
      if (subcommand === "switch") {
        if (!target) {
          ctx.ui.notify("Usage: /models switch <model-id>", "warning");
          return;
        }
        const match = findModel(allModels, target);
        if (!match) {
          ctx.ui.notify(`Model "${target}" not found.`, "warning");
          return;
        }
        if (match.loadStatus !== "loaded") {
          ctx.ui.notify(
            `"${match.name}" is not loaded (status: ${match.loadStatus}). Use /models load first.`,
            "warning",
          );
          return;
        }
        const model = ctx.modelRegistry.find(PROVIDER, match.id);
        if (!model) {
          ctx.ui.notify(
            `Model "${match.name}" not in registry; try \`/reload\`.`,
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
      if (allModels.length > 0) {
        lines.push("─ llamacpp (port 8000) ─");
        allModels.forEach((m, i) => {
          const icon = STATUS_ICON[m.loadStatus] ?? STATUS_ICON.unknown;
          lines.push(`  ${icon} ${i + 1}. ${m.name} (${m.id})`);
        });
      } else {
        lines.push("─ llamacpp (port 8000) ─ unavailable");
        ctx.ui.notify("No local models discovered. Server may be unavailable.", "warning");
        return;
      }

      lines.push("");
      lines.push("Subcommands: info, load <id>, unload [id], switch <id>");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
