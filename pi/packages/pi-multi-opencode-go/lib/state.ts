import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getStateFilePath } from "./agent-dir.ts";
import type { AccountUsage } from "./types.ts";

interface PersistedState {
  cooldowns: Record<string, number>;
}

export function loadPersistedCooldowns(): Record<string, number> {
  const path = getStateFilePath();
  try {
    if (!existsSync(path)) return {};
    const raw = JSON.parse(readFileSync(path, "utf-8")) as PersistedState;
    if (!raw?.cooldowns || typeof raw.cooldowns !== "object") return {};
    return raw.cooldowns;
  } catch {
    return {};
  }
}

export function savePersistedCooldowns(cooldowns: Record<string, number>): void {
  try {
    writeFileSync(
      getStateFilePath(),
      `${JSON.stringify({ cooldowns }, null, 2)}\n`,
      { mode: 0o600, encoding: "utf-8" },
    );
  } catch {
    // ignored
  }
}

export function mergePersistedCooldowns(usages: AccountUsage[]): void {
  const persisted = loadPersistedCooldowns();
  const now = Date.now();
  let dirty = false;
  for (const usage of usages) {
    const until = persisted[usage.account.label];
    if (typeof until === "number" && until > now) {
      usage.exhaustedUntil = until;
    } else if (typeof until === "number" && until <= now) {
      delete persisted[usage.account.label];
      dirty = true;
    }
  }
  if (dirty) savePersistedCooldowns(persisted);
}
