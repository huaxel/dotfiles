import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const BRIDGE = pi.config.get("llama-stats.bridge") ?? "http://localhost:9091";
  const POLL_INTERVAL = pi.config.get("llama-stats.pollInterval") ?? 1000;
  const IDLE_HIDE_MS = pi.config.get("llama-stats.idleHideMs") ?? 60000;
  const SHOW_SPARKLINE = pi.config.get("llama-stats.sparkline") ?? true;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastStats: Record<string, unknown> | null = null;
  let lastHistory: Array<[number, number, number]> = [];
  let isActive = false;
  let lastSeen = 0;
  let sseSource: EventSource | null = null;

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  async function fetchStats(signal?: AbortSignal): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${BRIDGE}/stats`, { signal });
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function fetchHistory(signal?: AbortSignal): Promise<Array<[number, number, number]>> {
    try {
      const res = await fetch(`${BRIDGE}/history`, { signal });
      if (!res.ok) return [];
      return (await res.json()) as Array<[number, number, number]>;
    } catch {
      return [];
    }
  }

  // ── Sparkline renderer ───────────────────────────────────────────────────

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

  // ── Speed classification ─────────────────────────────────────────────────

  function speedEmoji(speed: number): string {
    if (speed >= 50) return "🟢";
    if (speed >= 10) return "🟡";
    if (speed > 0) return "🔴";
    return "⚪";
  }

  // ── Widget formatting ────────────────────────────────────────────────────

  function formatWidget(stats: Record<string, unknown>): string[] {
    const model = (stats.model as string) ?? "unknown";
    const slots = (stats.slots as Record<string, Record<string, unknown>>) ?? {};
    const processing = (stats.is_processing as boolean) ?? false;
    const memory = (stats.memory as Record<string, number>) ?? {};
    const context = (stats.context as Record<string, number>) ?? {};

    const slotList = Object.values(slots);
    const activeSlots = slotList.filter((s) => s.is_processing);

    if (!processing && activeSlots.length === 0) {
      const lines: string[] = [`💤 ${model} — idle`];
      if (memory.vram_used_mb) {
        lines.push(`   VRAM: ${memory.vram_used_mb} MB`);
      }
      if (context.n_ctx) {
        lines.push(`   Ctx: ${context.n_ctx}`);
      }
      return lines;
    }

    // Aggregate speeds
    const ppSpeeds = activeSlots.map((s) => (s.pp_speed as number) ?? 0).filter((x) => x > 0);
    const tgSpeeds = activeSlots.map((s) => (s.tg_speed as number) ?? 0).filter((x) => x > 0);
    const totalPP = ppSpeeds.reduce((a, b) => a + b, 0);
    const totalTG = tgSpeeds.reduce((a, b) => a + b, 0);

    const lines: string[] = [];

    // Header line
    if (activeSlots.length === 1) {
      const slot = activeSlots[0];
      const state = (slot.state as string) ?? "processing";
      const speed = totalTG > 0 ? totalTG : totalPP;
      const emoji = speedEmoji(speed);
      lines.push(`${emoji} ${model} — ${state}`);
    } else {
      const emoji = speedEmoji(totalTG > 0 ? totalTG : totalPP);
      lines.push(`${emoji} ${model} — ${activeSlots.length} slots active`);
    }

    // Prompt progress
    const promptSlots = activeSlots.filter((s) => (s.state as string) === "prompt");
    if (promptSlots.length > 0) {
      const avgProgress = promptSlots.reduce((a, s) => a + ((s.pp_progress as number) ?? 0), 0) / promptSlots.length;
      const totalPromptTokens = promptSlots.reduce((a, s) => a + ((s.prompt_tokens as number) ?? 0), 0);
      const bar = "█".repeat(Math.round(avgProgress * 10)).padEnd(10, "░");
      lines.push(`   PP ${bar} ${(avgProgress * 100).toFixed(0)}%  ${totalPP.toFixed(1)} tok/s`);
      if (totalPromptTokens > 0) {
        lines.push(`      ${totalPromptTokens} prompt tokens`);
      }
    }

    // Generation speed
    if (totalTG > 0) {
      const totalDecoded = activeSlots.reduce((a, s) => a + ((s.n_decoded as number) ?? 0), 0);
      lines.push(`   TG ${totalTG.toFixed(1)} tok/s  ${totalDecoded} decoded`);
    }

    // Sparkline
    if (SHOW_SPARKLINE && lastHistory.length > 0) {
      const speeds = lastHistory.map(([, pp, tg]) => pp + tg);
      const spark = renderSparkline(speeds);
      if (spark) {
        const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        lines.push(`   ${spark}  ~${avg.toFixed(1)} avg`);
      }
    }

    // Memory
    if (memory.vram_used_mb) {
      const layers = memory.offloaded_layers && memory.total_layers
        ? `  ${memory.offloaded_layers}/${memory.total_layers} layers`
        : "";
      lines.push(`   VRAM: ${memory.vram_used_mb} MB${layers}`);
    }

    return lines;
  }

  // ── UI update ──────────────────────────────────────────────────────────────

  function updateUI(ctx: any) {
    if (!lastStats) {
      ctx.ui.setWidget("llama-stats", null);
      return;
    }

    const now = Date.now();
    const processing = (lastStats.is_processing as boolean) ?? false;

    // Auto-hide after idle timeout
    if (!processing && now - lastSeen > IDLE_HIDE_MS) {
      ctx.ui.setWidget("llama-stats", null);
      return;
    }

    const lines = formatWidget(lastStats);
    ctx.ui.setWidget("llama-stats", lines);
  }

  // ── Polling mode ───────────────────────────────────────────────────────────

  async function refresh(ctx: any) {
    const stats = await fetchStats(ctx.signal);
    if (stats) {
      lastStats = stats;
      isActive = true;
      if ((stats.is_processing as boolean) ?? false) {
        lastSeen = Date.now();
      }
    }
    if (SHOW_SPARKLINE) {
      const hist = await fetchHistory(ctx.signal);
      if (hist.length) lastHistory = hist;
    }
    updateUI(ctx);
  }

  function startPolling(ctx: any) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refresh(ctx), POLL_INTERVAL);
    refresh(ctx);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    isActive = false;
  }

  // ── SSE mode ─────────────────────────────────────────────────────────────

  function startSSE(ctx: any) {
    try {
      sseSource = new EventSource(`${BRIDGE}/stream`);
      sseSource.onmessage = (e) => {
        try {
          const stats = JSON.parse(e.data) as Record<string, unknown>;
          lastStats = stats;
          isActive = true;
          if ((stats.is_processing as boolean) ?? false) {
            lastSeen = Date.now();
          }
          updateUI(ctx);
        } catch {
          // ignore parse errors
        }
      };
      sseSource.onerror = () => {
        // Fall back to polling on SSE error
        sseSource?.close();
        sseSource = null;
        startPolling(ctx);
      };
    } catch {
      // EventSource not available or bridge down — fall back to polling
      startPolling(ctx);
    }
  }

  function stopSSE() {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    startSSE(ctx);
  });

  pi.on("session_shutdown", async () => {
    stopSSE();
    stopPolling();
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

      const model = (stats.model as string) ?? "unknown";
      const slots = (stats.slots as Record<string, Record<string, unknown>>) ?? {};
      const memory = (stats.memory as Record<string, number>) ?? {};
      const context = (stats.context as Record<string, number>) ?? {};
      const processing = (stats.is_processing as boolean) ?? false;

      const lines = [
        `Model: ${model}`,
        `State: ${processing ? "processing" : "idle"}`,
        `Slots: ${Object.keys(slots).length}`,
      ];

      for (const [id, slot] of Object.entries(slots)) {
        const state = (slot.state as string) ?? "?";
        const pp = ((slot.pp_speed as number) ?? 0).toFixed(1);
        const tg = ((slot.tg_speed as number) ?? 0).toFixed(1);
        const decoded = (slot.n_decoded as number) ?? 0;
        const progress = ((slot.pp_progress as number) ?? 0) * 100;
        lines.push(
          `  Slot ${id}: ${state}  PP ${pp}  TG ${tg}  ${decoded} decoded  ${progress.toFixed(0)}% prompt`
        );
      }

      lines.push("");
      lines.push(`Memory: ${memory.ram_used_mb ?? 0} MB RAM`);
      if (memory.vram_used_mb) {
        lines.push(`VRAM: ${memory.vram_used_mb} MB  ${memory.offloaded_layers ?? 0}/${memory.total_layers ?? 0} layers`);
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
      ctx.ui.setWidget("llama-stats", null);
      ctx.ui.notify("llama-stats widget hidden", "info");
    },
  });

  pi.registerCommand("llama-stats-on", {
    description: "Show llama-stats widget",
    handler: async (_args, ctx) => {
      updateUI(ctx);
      ctx.ui.notify("llama-stats widget enabled", "info");
    },
  });

  pi.registerCommand("llama-stats-poll", {
    description: "Force switch to polling mode (disable SSE)",
    handler: async (_args, ctx) => {
      stopSSE();
      stopPolling();
      startPolling(ctx);
      ctx.ui.notify("llama-stats: switched to polling mode", "info");
    },
  });

  pi.registerCommand("llama-stats-sse", {
    description: "Force switch to SSE streaming mode",
    handler: async (_args, ctx) => {
      stopPolling();
      stopSSE();
      startSSE(ctx);
      ctx.ui.notify("llama-stats: switched to SSE mode", "info");
    },
  });
}
