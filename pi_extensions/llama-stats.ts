import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

// ── Type definitions ───────────────────────────────────────────────────────

interface LlamaSlot {
  pp_speed?: number;
  pp_progress?: number;
  prompt_tokens?: number;
  tg_speed?: number;
  n_decoded?: number;
  is_processing?: boolean;
  state?: string;
  last_active?: number;
}

interface LlamaMemory {
  ram_used_mb?: number;
  vram_used_mb?: number;
  total_layers?: number;
  offloaded_layers?: number;
}

interface LlamaContext {
  n_ctx?: number;
  max_tokens?: number;
}

interface LlamaStats {
  model?: string | null;
  slots: Record<string, LlamaSlot>;
  memory: LlamaMemory;
  context: LlamaContext;
  history: Array<[number, number, number]>;
  is_processing?: boolean;
  last_update?: string | null;
  version?: string;
  unmatched_lines?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseInterval(val: string | undefined, def: number): number {
  const parsed = parseInt(val ?? String(def), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
}

function envBool(val: string | undefined, def: boolean): boolean {
  if (!val) return def;
  const lowered = val.toLowerCase().trim();
  return !["false", "0", "no", "off", ""].includes(lowered);
}

function isValidStats(val: unknown): val is LlamaStats {
  if (!val || typeof val !== "object") return false;
  const s = val as Record<string, unknown>;
  return (
    typeof s.slots === "object" &&
    s.slots !== null &&
    Array.isArray(s.history)
  );
}

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Configuration: pi.config takes priority, then env vars, then defaults
  const BRIDGE =
    (pi.config?.get("llama-stats.bridge") as string | undefined) ??
    process.env.LLAMA_STATS_BRIDGE ??
    "http://framearch-juan:55268";

  const POLL_INTERVAL =
    (pi.config?.get("llama-stats.pollInterval") as number | undefined) ??
    parseInterval(process.env.LLAMA_STATS_POLL_INTERVAL, 1000);

  const IDLE_HIDE_MS =
    (pi.config?.get("llama-stats.idleHideMs") as number | undefined) ??
    parseInterval(process.env.LLAMA_STATS_IDLE_HIDE_MS, 60000);

  const SHOW_SPARKLINE =
    (pi.config?.get("llama-stats.sparkline") as boolean | undefined) ??
    envBool(process.env.LLAMA_STATS_SPARKLINE, true);

  // Only show the widget for sessions that are actually using a local
  // llama.cpp provider. This avoids cluttering the UI when talking to remote
  // providers (OpenAI, Umans, etc.). Defaults cover the framearch/Cachy
  // providers registered by framearch-autodiscover.
  const WATCHED_PROVIDERS = new Set(
    (pi.config?.get("llama-stats.providers") as string[] | undefined) ?? [
      "framearch",
      "cachy",
    ],
  );

  function shouldShowFor(ctx: any): boolean {
    const provider = ctx?.model?.provider ?? "";
    return WATCHED_PROVIDERS.has(provider);
  }

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStats: LlamaStats | null = null;
  let lastHistory: Array<[number, number, number]> = [];
  let isActive = false;
  let lastSuccess = 0;
  let lastSeen = 0;
  let sseSource: EventSource | null = null;
  let bgAbortController: AbortController | null = null;
  let isPolling = false;
  let currentPollPromise: Promise<void> | null = null;
  let sseRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let sseRetryDelay = 5000;
  const SSE_RETRY_MAX = 30000;
  let autoReconnect = true;

  // ── Fetch helpers ────────────────────────────────────────────────────────

  async function fetchStats(
    signal?: AbortSignal
  ): Promise<LlamaStats | null> {
    try {
      const res = await fetch(`${BRIDGE}/stats`, { signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (!isValidStats(data)) return null;
      return data as LlamaStats;
    } catch {
      return null;
    }
  }

  // ── Sparkline renderer ─────────────────────────────────────────────────

  const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

  function renderSparkline(values: number[], width = 12): string {
    if (values.length === 0) return "";
    const recent = values.slice(-width);
    const min = Math.min(...recent);
    const max = Math.max(...recent);
    const range = max - min || 1;
    return recent
      .map((v) => {
        const idx = Math.floor(((v - min) / range) * (BLOCKS.length - 1));
        return BLOCKS[Math.min(idx, BLOCKS.length - 1)];
      })
      .join("");
  }

  // ── State icons (Nerd Font — JetBrainsMono NF) ────────────────────────

  const ICON = {
    idle: "󰏤",       // nf-md-pause
    prompt: "󰊗",     // nf-md-magnify
    gen: "󰻠",        // nf-md-cog
  } as const;

  // ── Widget formatting ──────────────────────────────────────────────────

  function formatWidget(
    stats: LlamaStats,
    history: Array<[number, number, number]>,
    width?: number
  ): string[] {
    const slots = stats.slots ?? {};
    const processing = stats.is_processing ?? false;
    const memory = stats.memory ?? {};
    const context = stats.context ?? {};
    const sep = " ▸ ";

    const slotList = Object.values(slots);
    const activeSlots = slotList.filter((s) => s.is_processing);

    const fmtMem = (mb: number) =>
      mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

    // Idle — one line
    if (!processing && activeSlots.length === 0) {
      const parts = [ICON.idle];
      if (memory.vram_used_mb) parts.push(fmtMem(memory.vram_used_mb));
      if (context.n_ctx) parts.push(`Ctx ${context.n_ctx}`);
      const line = parts.join(sep);
      return width ? [truncateToWidth(line, width)] : [line];
    }

    // Aggregate speeds
    const ppSpeeds = activeSlots
      .map((s) => s.pp_speed ?? 0)
      .filter((x) => x > 0);
    const tgSpeeds = activeSlots
      .map((s) => s.tg_speed ?? 0)
      .filter((x) => x > 0);
    const totalPP = ppSpeeds.reduce((a, b) => a + b, 0);
    const totalTG = tgSpeeds.reduce((a, b) => a + b, 0);

    const icon = activeSlots.some((s) => s.state === "prompt")
      ? ICON.prompt
      : ICON.gen;
    const parts: string[] = [icon];

    // Prompt progress — inline bar
    const promptSlots = activeSlots.filter((s) => s.state === "prompt");
    if (promptSlots.length > 0) {
      const avgProgress =
        promptSlots.reduce((a, s) => a + (s.pp_progress ?? 0), 0) /
        promptSlots.length;
      const totalPromptTokens = promptSlots.reduce(
        (a, s) => a + (s.prompt_tokens ?? 0),
        0
      );
      const bar = "█".repeat(Math.round(avgProgress * 10)).padEnd(10, "░");
      parts.push(`[${bar}] ${(avgProgress * 100).toFixed(0)}%`);
      parts.push(`${totalPP.toFixed(1)} tok/s`);
      if (totalPromptTokens > 0) parts.push(`${totalPromptTokens} tok`);
    }

    // Generation speed
    if (totalTG > 0) {
      const totalDecoded = activeSlots.reduce(
        (a, s) => a + (s.n_decoded ?? 0),
        0
      );
      parts.push(`${totalTG.toFixed(1)} tok/s`);
      parts.push(`${totalDecoded} ▾`);
    }

    // Memory
    if (memory.vram_used_mb) {
      const layers =
        memory.offloaded_layers && memory.total_layers
          ? ` ${memory.offloaded_layers}/${memory.total_layers}`
          : "";
      parts.push(`${fmtMem(memory.vram_used_mb)}${layers}`);
    }

    // Sparkline — short, inline
    if (SHOW_SPARKLINE && history.length > 0) {
      const speeds = history.map(([, pp, tg]) => pp + tg);
      const spark = renderSparkline(speeds, 8);
      if (spark) parts.push(spark);
    }

    const line = parts.join(sep);
    return width ? [truncateToWidth(line, width)] : [line];
  }

  // ── UI update ────────────────────────────────────────────────────────────

  function updateUI(ctx: any) {
    try {
      if (!ctx?.ui?.setWidget) {
        return;
      }
      if (!isActive || !lastStats) {
        ctx.ui.setWidget("llama-stats", undefined);
        return;
      }

      const now = Date.now();
      const processing = lastStats.is_processing ?? false;

      // Auto-hide after idle timeout
      if (!processing && now - lastSeen > IDLE_HIDE_MS) {
        ctx.ui.setWidget("llama-stats", undefined);
        return;
      }

      // Use factory form — render() reads live state so the TUI always
      // gets fresh content on each render cycle.  The simple string-array
      // form can cause the differential renderer to miss updates because
      // it compares stale snapshots.
      ctx.ui.setWidget("llama-stats", (_tui: any, _theme: any) => ({
        render: (width: number) => {
          if (!lastStats || !isActive) return [];
          return formatWidget(lastStats, lastHistory, width);
        },
        invalidate: () => {},
        dispose: () => {},
      }));
    } catch (err: any) {
      // Stale context after session reload — ignore
      if (err?.message?.includes("stale")) {
        return;
      }
      throw err;
    }
  }

  // ── Polling mode ─────────────────────────────────────────────────────────

  async function refresh(ctx: any, signal?: AbortSignal) {
    const stats = await fetchStats(signal);
    // Guard: if polling was stopped while we were in-flight, skip updates
    if (!isPolling) return;
    if (stats) {
      lastStats = stats;
      lastSuccess = Date.now();
      isActive = true;
      if (stats.is_processing) {
        lastSeen = Date.now();
      }
      if (SHOW_SPARKLINE && stats.history?.length) {
        lastHistory = stats.history;
      }
    } else if (Date.now() - lastSuccess > 5000) {
      isActive = false;
      lastStats = null;
    }
    try {
      updateUI(ctx);
    } catch {
      // ignore stale context
    }
  }

  async function startPolling(ctx: any) {
    await stopPolling();
    isPolling = true;
    bgAbortController = new AbortController();
    async function tick() {
      if (!isPolling) return;
      currentPollPromise = refresh(ctx, bgAbortController?.signal);
      await currentPollPromise;
      currentPollPromise = null;
      if (isPolling) {
        pollTimer = setTimeout(tick, POLL_INTERVAL);
      }
    }
    tick();
  }

  async function stopPolling(deactivate = true) {
    isPolling = false;
    bgAbortController?.abort();
    bgAbortController = null;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (deactivate) {
      isActive = false;
    }
    if (currentPollPromise) {
      await currentPollPromise;
      currentPollPromise = null;
    }
  }

  // ── SSE reconnection ──────────────────────────────────────────────────

  function scheduleSSEReconnect(ctx: any) {
    if (sseRetryTimer || !autoReconnect) return;
    sseRetryTimer = setTimeout(() => {
      sseRetryTimer = null;
      startSSE(ctx);
    }, sseRetryDelay);
    sseRetryDelay = Math.min(sseRetryDelay * 1.5, SSE_RETRY_MAX);
  }

  function clearSSERetry() {
    if (sseRetryTimer) {
      clearTimeout(sseRetryTimer);
      sseRetryTimer = null;
    }
  }

  // ── SSE mode ───────────────────────────────────────────────────────────

  async function startSSE(ctx: any) {
    isActive = true;
    lastStats = null; // clear stale data on reconnect
    try {
      sseSource = new EventSource(`${BRIDGE}/stream`);
      sseSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (!isValidStats(data)) return;
          const stats = data as LlamaStats;
          lastStats = stats;
          lastSuccess = Date.now();
          isActive = true;
          sseRetryDelay = 5000; // reset backoff on successful message
          if (isPolling) {
            stopPolling(false).catch(() => {});
          }
          if (stats.is_processing) {
            lastSeen = Date.now();
          }
          if (SHOW_SPARKLINE && stats.history?.length) {
            lastHistory = stats.history;
          }
          updateUI(ctx);
        } catch {
          // ignore parse errors
        }
      };
      sseSource.onerror = () => {
        sseSource?.close();
        sseSource = null;
        if (!isPolling) {
          startPolling(ctx).catch(() => {});
        }
        scheduleSSEReconnect(ctx);
      };
    } catch {
      if (!isPolling) {
        startPolling(ctx).catch(() => {});
      }
      scheduleSSEReconnect(ctx);
    }
  }

  function stopSSE() {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    isActive = false;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    autoReconnect = true;
    sseRetryDelay = 5000;
    await stopSSE();
    clearSSERetry();
    await stopPolling();
    if (!shouldShowFor(ctx)) {
      ctx.ui.setWidget("llama-stats", undefined);
      return;
    }
    startSSE(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    if (!shouldShowFor(ctx)) {
      autoReconnect = false;
      await stopSSE();
      clearSSERetry();
      await stopPolling();
      ctx.ui.setWidget("llama-stats", undefined);
      return;
    }
    if (isActive || isPolling || sseSource) return;
    autoReconnect = true;
    sseRetryDelay = 5000;
    await startSSE(ctx);
  });

  pi.on("session_shutdown", async () => {
    stopSSE();
    clearSSERetry();
    await stopPolling();
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  pi.registerCommand("llama-stats", {
    description: "Show detailed llama.cpp inference stats",
    handler: async (_args, ctx) => {
      const stats = await fetchStats(ctx.signal);
      if (!stats) {
        ctx.ui.notify("llama-stats bridge not reachable", "error");
        return;
      }

      const model = stats.model ?? "unknown";
      const slots = stats.slots ?? {};
      const memory = stats.memory ?? {};
      const context = stats.context ?? {};
      const processing = stats.is_processing ?? false;

      const lines = [
        `Model: ${model}`,
        `State: ${processing ? "processing" : "idle"}`,
        `Slots: ${Object.keys(slots).length}`,
      ];

      for (const [id, slot] of Object.entries(slots)) {
        const state = slot.state ?? "?";
        const pp = (slot.pp_speed ?? 0).toFixed(1);
        const tg = (slot.tg_speed ?? 0).toFixed(1);
        const decoded = slot.n_decoded ?? 0;
        const progress = (slot.pp_progress ?? 0) * 100;
        lines.push(
          `  Slot ${id}: ${state}  PP ${pp}  TG ${tg}  ${decoded} decoded  ${progress.toFixed(
            0
          )}% prompt`
        );
      }

      lines.push("");
      lines.push(`Memory: ${memory.ram_used_mb ?? 0} MB RAM`);
      if (memory.vram_used_mb) {
        lines.push(
          `VRAM: ${memory.vram_used_mb} MB  ${memory.offloaded_layers ?? 0}/${
            memory.total_layers ?? 0
          } layers`
        );
      }
      if (context.n_ctx) {
        lines.push(`Context: ${context.n_ctx} tokens`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("llama-stats-off", {
    description: "Hide llama-stats widget",
    handler: async (_args, ctx) => {
      autoReconnect = false;
      await stopSSE();
      clearSSERetry();
      await stopPolling();
      ctx.ui.setWidget("llama-stats", undefined);
      ctx.ui.notify("llama-stats widget hidden", "info");
    },
  });

  pi.registerCommand("llama-stats-on", {
    description: "Show llama-stats widget",
    handler: async (_args, ctx) => {
      autoReconnect = true;
      clearSSERetry();
      await stopPolling(false);
      await stopSSE();
      await startSSE(ctx);
      ctx.ui.notify("llama-stats widget enabled", "info");
    },
  });

  pi.registerCommand("llama-stats-poll", {
    description: "Force switch to polling mode (disable SSE)",
    handler: async (_args, ctx) => {
      autoReconnect = false;
      await stopSSE();
      clearSSERetry();
      await stopPolling();
      await startPolling(ctx);
      ctx.ui.notify("llama-stats: switched to polling mode", "info");
    },
  });

  pi.registerCommand("llama-stats-sse", {
    description: "Force switch to SSE streaming mode",
    handler: async (_args, ctx) => {
      autoReconnect = true;
      await stopPolling();
      await stopSSE();
      clearSSERetry();
      await startSSE(ctx);
      ctx.ui.notify("llama-stats: switched to SSE mode", "info");
    },
  });
}
