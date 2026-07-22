/**
 * Subagent Model Watch — TUI widget showing model attribution for subagent calls.
 *
 * Shows the agent name, primary model tried, and any fallback chain when
 * the first model fails and a fallback is used. Auto-clears after 15s.
 *
 * Example displays:
 *   worker: nan/qwen3.6 ✓
 *   worker: nan/qwen3.6 → ✗ rate limit → opencode-go/dsv4-flash ✓
 *   reviewer: opencode-go/dsv4-flash ✗ (all 3 fallbacks exhausted)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WIDGET_KEY = "agent-models";
const AUTO_CLEAR_MS = 15_000;

export default function (pi: ExtensionAPI) {
  const agentMap = new Map<string, string>();
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleClear(ctx: any): void {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearTimer = null;
      try { ctx.ui.setWidget(WIDGET_KEY, undefined); } catch { /* stale context */ }
    }, AUTO_CLEAR_MS);
  }

  pi.on("tool_call", (event) => {
    if (event.toolName !== "subagent") return;
    const input = event.input as Record<string, unknown>;
    if (typeof input?.agent === "string") {
      agentMap.set(event.toolCallId, input.agent);
    }
  });

  pi.on("tool_execution_end", (event, ctx) => {
    if (event.toolName !== "subagent") return;
    if (!ctx.hasUI) return;

    const agent = agentMap.get(event.toolCallId) ?? "?";
    agentMap.delete(event.toolCallId);

    // Safely extract model details from the tool result.
    // pi-subagents nests model info inside details.results[0] for foreground
    // calls and host them directly for background/synthesis calls.
    const result = event.result as any;
    const details = result?.details as Record<string, unknown> | undefined;
    if (!details) return;

    const firstResult = (details.results as Array<Record<string, unknown>> | undefined)?.[0];
    const model = String(
      firstResult?.model ?? details.model ?? details.attemptedModels?.[0] ?? "?",
    );
    const attemptedModels = (
      (firstResult?.attemptedModels as string[] | undefined) ??
      (details.attemptedModels as string[] | undefined) ??
      []
    );
    const modelAttempts = (
      (firstResult?.modelAttempts as Array<Record<string, unknown>> | undefined) ??
      (details.modelAttempts as Array<Record<string, unknown>> | undefined) ??
      []
    );
    const error = (firstResult?.error as string | undefined) ?? (details.error as string | undefined);

    // Build chain display
    const chain: string[] = [];
    if (modelAttempts.length <= 1) {
      // Single model — success or fail
      chain.push(`${agent}: ${model} ${error ? "✗" : "✓"}`);
      if (error) chain[0] += ` ${error.slice(0, 40)}`;
    } else {
      // Multiple models tried — show the chain
      for (const attempt of modelAttempts) {
        const m = String(attempt.model ?? "?");
        if (attempt.success) {
          break;
        }
        const err = attempt.error ? String(attempt.error).slice(0, 25) : "✗";
        chain.push(m);
        chain.push(`✗ ${err}`);
      }
      // Push the winning model if any attempt succeeded
      const winner = attemptedModels.length > 0
        ? attemptedModels[attemptedModels.length - 1]
        : undefined;
      if (winner && !error) {
        chain.push(winner);
        chain.push("✓");
      } else if (error) {
        chain.push(`✗ ${error.slice(0, 40)}`);
      }

      // Prepend agent name
      chain.unshift(`${agent}:`);
    }

    const display = chain.join(" ");
    const displayLines = display.length > 80
      ? [display.slice(0, 80) + "…"]
      : [display];

    ctx.ui.setWidget(WIDGET_KEY, (_tui: any, theme: any) => ({
      render: (_width: number) => displayLines.map((line) => theme.fg("muted", line)),
      invalidate: () => {},
    }));

    scheduleClear(ctx);
  });

  pi.on("session_shutdown", () => {
    agentMap.clear();
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  });
}
