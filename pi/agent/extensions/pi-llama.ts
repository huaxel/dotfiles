import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Loader, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── Configuration ────────────────────────────────────────────────────────

const PROVIDER = "llamacpp";
const HOST = process.env.PI_LLAMA_HOST || "framearch-juan";
const PORT = Number(process.env.PI_LLAMA_PORT) || 8000;
const DISCOVERY_URL = `http://${HOST}:${PORT}/v1/models`;
const API_BASE_URL = `http://${HOST}:${PORT}/v1`;
const ROOT_URL = `http://${HOST}:${PORT}`; // load/unload at root, not /v1

const DISCOVERY_TIMEOUT_MS =
  Number(process.env.PI_LLAMA_TIMEOUT_MS) || 15000;
const PROPS_TIMEOUT_MS = 120_000; // /props auto-load can take a while for large models

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

// SSE event types for loading progress
type ModelLoadStage = "text_model" | "spec_model" | "mmproj_model";

interface SseProgress {
  stages: ModelLoadStage[];
  current: ModelLoadStage;
  value: number;
}

interface SseEvent {
  model: string;
  event: string;
  data: {
    status: string;
    progress?: SseProgress;
    exit_code?: number;
  };
}

const MODEL_LOAD_STAGE_LABELS: Record<ModelLoadStage, string> = {
  text_model: "Loading weights",
  spec_model: "Loading draft",
  mmproj_model: "Loading projector",
};

// ── Constants ────────────────────────────────────────────────────────────

const STATUS_ICON: Record<ModelLoadStatus, string> = {
  loaded: "\uF0100",
  loading: "\uF0DD0",
  error: "\uF015A",
  unloaded: "\uF0DE4",
  unknown: "\uF02D7",
};

const COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  thinkingFormat: "qwen" as const,
  maxTokensField: "max_tokens" as const,
};

// llama.cpp thinking: off / low (512) / medium (2048) / high (8192) / max (\u221E)
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

/** Detect Pi's "stale after session replacement" error. */
function isStaleContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("stale after session replacement");
}

// ── State ────────────────────────────────────────────────────────────────

let discoveredModels: DiscoveredModel[] | undefined;
let discoveryPromise: Promise<DiscoveredModel[] | undefined> | undefined;

// Metadata tracked per model: whether we've fetched /props, its context window, etc.
const discoveredMetadata = new Set<string>();
const pendingMetadata = new Set<string>();
const loadedModelContext = new Map<string, number>();

// SSE loading progress
let activeSseAbort: AbortController | null = null;
let statusTimeout: ReturnType<typeof setTimeout> | undefined;

function clearStatusTimeout(): void {
  if (statusTimeout !== undefined) {
    clearTimeout(statusTimeout);
    statusTimeout = undefined;
  }
}

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
      contextWindow: loadedModelContext.get(m.id) ?? getContextWindow(m),
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
    try {
      const models = await fetchModels(DISCOVERY_URL, PROVIDER);
      if (models) {
        discoveredModels = models;
        registerProvider(pi, models);
      } else {
        registerProvider(pi);
      }
      return models;
    } finally {
      discoveryPromise = undefined;
    }
  })();

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

// ── /props auto-load with SSE progress ────────────────────────────────

/** Connect to /models/sse for live load progress. */
async function watchLoadProgress(
  modelId: string,
  ctx: any,
  loader: Loader,
): Promise<AbortController> {
  const abort = new AbortController();
  // Close previous SSE connection
  activeSseAbort?.abort();
  activeSseAbort = abort;

  try {
    const res = await fetch(`${ROOT_URL}/models/sse`, { signal: abort.signal });
    if (!res.ok || !res.body) return abort;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!abort.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        if (!event) continue;
        const dataLine = event
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!dataLine) continue;

        try {
          const ev = JSON.parse(dataLine) as SseEvent;
          if (ev.model !== modelId) continue;

          if (ev.data.exit_code && ev.data.exit_code !== 0) {
            loader.setMessage(`${modelId}: failed (exit ${ev.data.exit_code})`);
            return abort;
          }

          if (ev.data.status === "loading" && ev.data.progress) {
            const stage = ev.data.progress.current;
            const stageLabel = MODEL_LOAD_STAGE_LABELS[stage] || stage;
            const pct = Math.round(ev.data.progress.value * 100);
            loader.setMessage(`${modelId}: ${stageLabel} (${pct}%)`);
          }
        } catch {
          // parse error, skip
        }
      }
    }
  } catch (error: unknown) {
    if (
      abort.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError") ||
      isStaleContextError(error)
    ) {
      return abort;
    }
    // Non-critical: SSE is a nice-to-have, loading continues without it
  }

  return abort;
}

/** Fetch /props?model=...&autoload=true and update context window. */
async function fetchModelProps(
  modelId: string,
  ctx: any,
  shouldAutoload: boolean,
): Promise<number | undefined> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), PROPS_TIMEOUT_MS);

  try {
    const url = `${ROOT_URL}/props?model=${encodeURIComponent(modelId)}&autoload=${shouldAutoload}`;
    const res = await fetch(url, { signal: abortController.signal });
    if (!res.ok) return undefined;

    const data = (await res.json()) as {
      default_generation_settings?: { n_ctx?: number };
      chat_template?: string;
    };
    return data.default_generation_settings?.n_ctx;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Auto-load and discover props for a model. Shows SSE progress if autoloading. */
async function autoLoadModel(
  modelId: string,
  ctx: any,
  pi: ExtensionAPI,
): Promise<void> {
  if (pendingMetadata.has(modelId)) return;
  pendingMetadata.add(modelId);

  const model = discoveredModels?.find((m) => m.id === modelId);
  if (!model) {
    pendingMetadata.delete(modelId);
    return;
  }

  const alreadyLoaded = model.loadStatus === "loaded";
  const needsAutoload = !alreadyLoaded;

  let loader: Loader | null = null;

  // Show loading widget
  if (needsAutoload && ctx?.ui?.setWidget) {
    clearStatusTimeout();
    ctx.ui.setWidget(PROVIDER, (ui, theme) => {
      const prefix = theme.fg("accent", ` [${PROVIDER}]`);
      const prefixWidth = visibleWidth(` [${PROVIDER}]`);
      loader = new Loader(
        ui,
        (s) => theme.fg("accent", s),
        (t) => theme.fg("text", t),
        `${model.name}: Loading...`,
      );
      return {
        dispose: () => loader?.stop(),
        render: (width: number) => {
          const [_, line] = loader.render(width - prefixWidth);
          return [prefix + truncateToWidth(line, width - prefixWidth)];
        },
      };
    });

    // Start SSE progress stream
    void watchLoadProgress(modelId, ctx, loader);
  }

  // Fetch /props (auto-loads if needed)
  const nCtx = await fetchModelProps(modelId, ctx, needsAutoload);

  // Update discovery flag and context
  discoveredMetadata.add(modelId);
  pendingMetadata.delete(modelId);

  if (typeof nCtx === "number" && nCtx > 0) {
    loadedModelContext.set(modelId, nCtx);
    model.contextWindow = nCtx;
    model.maxTokens = Math.min(model.maxTokens, nCtx);
  }

  // Update model load status
  model.loadStatus = "loaded";

  // Show success footer
  if (needsAutoload && ctx?.ui?.setWidget) {
    const displayName = model.name.split(" ")[0];
    const prefix = ctx.ui.theme.fg("success", `[${PROVIDER}] ✓`);
    ctx.ui.setWidget(PROVIDER, [
      prefix +
        ctx.ui.theme.fg(
          "text",
          ` ${displayName}: Loaded${nCtx ? ` with context ${nCtx} tokens` : ""}`,
        ),
    ]);
    clearStatusTimeout();
    statusTimeout = setTimeout(() => {
      statusTimeout = undefined;
      try {
        ctx?.ui?.setWidget(PROVIDER, undefined);
      } catch { /* stale ctx */ }
    }, 8000);
  }

  // Re-register provider with updated metadata
  if (discoveredModels) {
    registerProvider(pi, discoveredModels);
  }
}

// ── Extension ────────────────────────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  // Register a shell provider immediately so the factory resolves fast.
  registerProvider(pi);
  triggerDiscovery(pi);

  const isLlama = (name: string) => name === PROVIDER;

  // ── Events ──────────────────────────────────────────────────────────

  pi.on("model_select", async (event, ctx) => {
    if (!isLlama(event.model.provider)) return;

    // Auto-load and discover /props for the selected model
    const modelId = event.model.id;
    if (!discoveredMetadata.has(modelId)) {
      await autoLoadModel(modelId, ctx, pi);
    }

    // Re-discover to refresh the model list and status
    await discover(pi);
  });

  pi.on("session_start", () => {
    triggerDiscovery(pi);
  });

  pi.on("before_provider_request", async (event, ctx) => {
    const provider = ctx.model?.provider ?? "";
    if (!isLlama(provider)) return;

    triggerDiscovery(pi);
    applyThinkingPayload(event.payload, pi.getThinkingLevel() as ThinkingLevel);

    // Ensure the model is loaded and props discovered
    const modelId = ctx.model?.id;
    if (modelId && !discoveredMetadata.has(modelId)) {
      // Fire-and-forget: auto-load will run in background
      autoLoadModel(modelId, ctx, pi).catch(() => {});
    }
  });

  // ── Context overflow normalization ──
  // Rewrite llama.cpp context-length errors so pi auto-compacts and retries.
  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (message.provider !== PROVIDER && ctx.model?.provider !== PROVIDER) return;

    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;

    // Match common llama.cpp overflow patterns
    const LLAMA_OVERFLOW = /context|ctx|exceed|too long/i;
    if (!LLAMA_OVERFLOW.test(errorMessage)) return;

    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });

  pi.on("session_shutdown", () => {
    clearStatusTimeout();
    activeSseAbort?.abort();
    activeSseAbort = null;
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

        // Use /props auto-load for progress
        await autoLoadModel(match.id, ctx, pi);
        ctx.ui.notify(`Loaded ${match.name}.`, "info");
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
            discoveredMetadata.delete(match.id);
            loadedModelContext.delete(match.id);
            match.loadStatus = "unloaded";
            triggerDiscovery(pi);
            ctx.ui.notify(`${match.name} unloaded.`, "info");
          } else {
            console.warn(`[pi-llama] unload ${match.id} failed:`, result.status, result.text);
            ctx.ui.notify(`Failed to unload ${match.name} (${result.status}).`, "warning");
          }
        } else {
          ctx.ui.notify("Unloading all models...", "info");
          const result = await unloadModel();
          discoveredMetadata.clear();
          loadedModelContext.clear();
          if (discoveredModels) {
            discoveredModels.forEach((m) => { m.loadStatus = "unloaded"; });
          }
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
          // Auto-load first
          await autoLoadModel(match.id, ctx, pi);
          await discover(pi);
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
        lines.push(`─ ${PROVIDER} (port ${PORT}) ─`);
        allModels.forEach((m, i) => {
          const icon = STATUS_ICON[m.loadStatus] ?? STATUS_ICON.unknown;
          lines.push(`  ${icon} ${i + 1}. ${m.name} (${m.id})`);
        });
      } else {
        lines.push(`─ ${PROVIDER} (port ${PORT}) ─ unavailable`);
        ctx.ui.notify("No local models discovered. Server may be unavailable.", "warning");
        return;
      }

      lines.push("");
      lines.push("Subcommands: info, load <id>, unload [id], switch <id>");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
