import type { OpenCodeGoAccount } from "./types.ts";

export function setActiveAccountLabel(account: OpenCodeGoAccount | null): void {
  if (!account) return;
  const g = globalThis as Record<string, unknown>;
  const prevLabel = g.__opencode_go_active_label;
  g.__opencode_go_active_label = account.label;
  if (account.label !== prevLabel) {
    const trigger = g.__opencode_go_trigger_refresh;
    if (typeof trigger === "function") trigger();
  }
}

export function setInitialActiveLabel(label: string): void {
  (globalThis as Record<string, unknown>).__opencode_go_active_label = label;
}
