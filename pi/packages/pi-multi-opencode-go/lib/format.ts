import type { OpenCodeGoWindow } from "./types.ts";

export function formatReset(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d${remHours}h` : `${days}d`;
}

export function formatUsageWindow(
  window: OpenCodeGoWindow | null,
  fallback = "—",
): string {
  if (!window) return fallback;
  return `${window.usagePercent.toFixed(0)}% (${formatReset(window.resetInSec)})`;
}
