import { basename } from "node:path";
import type { SegmentRenderer, FooterInput } from "./types.js";
import {
  fmtDuration,
  fmtTokens,
  shortenPath,
  thinkingColor,
  contextUsageColor,
  rainbowText,
} from "./format.js";

/* ───── Usage bar helpers ───── */

const BAR_FILLED = "━";
const BAR_EMPTY = "─";
const SHOW_WINDOW_THRESHOLD = 5;

const THINKING_ABBR: Record<string, string> = {
  minimal: "min",
  medium: "med",
  xhigh: "xhi",
};

function maxQuotaPercent(input: FooterInput): number {
  if (!input.quotaUsage?.windows?.length) return 0;
  return Math.max(...input.quotaUsage.windows.map((w) => w.usedPercent));
}

function quotaColor(usedPercent: number): string | null {
  if (usedPercent >= 92) return "error";
  if (usedPercent >= 85) return "warning";
  return null;
}

function renderUsageBar(usedPercent: number, barWidth: number, theme: FooterInput["theme"]): string {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  const filled = Math.round((clamped / 100) * barWidth);
  const empty = barWidth - filled;

  let color: string;
  if (clamped >= 92) color = "error";
  else if (clamped >= 85) color = "warning";
  else color = "success";

  return theme.fg(color, BAR_FILLED.repeat(filled)) + theme.fg("dim", BAR_EMPTY.repeat(empty));
}

function renderUsageWindow(
  label: string,
  usedPercent: number,
  theme: FooterInput["theme"],
): string {
  const dim = (s: string) => theme.fg("dim", s);
  const bar = renderUsageBar(usedPercent, 4, theme);
  const pct = dim(`${Math.round(usedPercent)}%`);
  return `${dim(label)}${bar}${pct}`;
}

export const builtinRenderers: Record<string, SegmentRenderer> = {
  modelThink(input) {
    const { model, thinkingLevel, fastModeEnabled, serviceTier, theme, quotaUsage } = input;
    const shortLevel = THINKING_ABBR[thinkingLevel] ?? thinkingLevel;
    const text = `${model}:${shortLevel}`;
    const tier = fastModeEnabled ? theme.fg("accent", ` ⚡${serviceTier ?? "fast"}`) : "";
    if (thinkingLevel === "xhigh" || thinkingLevel === "max") {
      return rainbowText(text) + tier;
    }
    // Override color with quota alert when usage is high
    const maxPct = maxQuotaPercent(input);
    const qColor = quotaColor(maxPct);
    const color = qColor ?? thinkingColor(thinkingLevel);
    return theme.fg(color, text) + tier;
  },

  runtime(input) {
    return input.theme.fg("dim", fmtDuration(input.runtimeMs));
  },

  pwd(input) {
    const path = input.showFullPath ? shortenPath(input.cwd) : basename(input.cwd);
    return input.theme.fg("dim", path);
  },

  git(input) {
    const { gitBranch, gitDiffAdded, gitDiffRemoved, theme } = input;
    if (!gitBranch) return "";
    let text = theme.fg("dim", gitBranch);
    if (gitDiffAdded > 0 || gitDiffRemoved > 0) {
      text += ` ${theme.fg("success", `+${gitDiffAdded}`)} ${theme.fg("error", `-${gitDiffRemoved}`)}`;
    }
    return text;
  },

  contextUsage(input) {
    const { contextUsage, theme, settings } = input;
    if (!contextUsage || !contextUsage.contextWindow) return "";

    const tokens = contextUsage.tokens || 0;
    const max = contextUsage.contextWindow;
    const pct = Math.min(100, Math.max(0, Math.round((tokens / max) * 100)));

    let text = "ctx";

    if (settings.segments.contextProgress) {
      const barWidth = 10;
      const filled = Math.round((pct / 100) * barWidth);
      const empty = barWidth - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);
      text += ` [${bar}]`;
    }

    if (settings.segments.contextPercentage) {
      text += ` ${pct}%`;
    }

    if (settings.segments.contextNumbers) {
      text += ` ${fmtTokens(tokens)}/${fmtTokens(max)}`;
    }

    return theme.fg(
      contextUsageColor(pct, settings.contextZones.expert, settings.contextZones.warning),
      text,
    );
  },

  tokens(input) {
    const { totalInputTokens, totalOutputTokens, theme } = input;
    return theme.fg("dim", `↑${fmtTokens(totalInputTokens)} ↓${fmtTokens(totalOutputTokens)}`);
  },

  tps(input) {
    const { isStreaming, currentTurnStartTime, currentTurnUpdateCount, lastTurnTps, theme } = input;
    if (isStreaming && currentTurnStartTime) {
      const elapsed = (Date.now() - currentTurnStartTime) / 1000;
      const liveTps = elapsed > 0 ? currentTurnUpdateCount / elapsed : 0;
      return theme.fg("accent", `⚡${liveTps.toFixed(1)}`);
    } else if (lastTurnTps > 0) {
      return theme.fg("dim", `⚡${lastTurnTps.toFixed(1)}`);
    }
    return "";
  },

  cost(input) {
    const { totalCost, theme } = input;
    return theme.fg("dim", `$${totalCost.toFixed(2)}`);
  },

  usageBars(input) {
    const { quotaUsage, theme } = input;
    if (!quotaUsage || quotaUsage.windows.length === 0) return "";

    const dim = (s: string) => theme.fg("dim", s);
    const shown = quotaUsage.windows.filter((w) => w.usedPercent >= SHOW_WINDOW_THRESHOLD);
    if (shown.length === 0) return "";

    const sep = " " + dim("▸") + " ";
    return sep + shown.map((w) =>
      renderUsageWindow(w.label, w.usedPercent, theme),
    ).join(dim(" "));
  },
};
