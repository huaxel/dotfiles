import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Optional overrides loaded from `$PI_CODING_AGENT_DIR/agy-config.json`
 * (default `~/.pi/agent/agy-config.json`). Missing or malformed files fall
 * back to built-in defaults.
 */
export interface AgyConfig {
  /**
   * Auto-approve agy tool permission requests for accept-edits runs
   * (`--dangerously-skip-permissions`). Default `true`. When `false`,
   * accept-edits runs without the permission bypass — agy print mode has
   * no interactive approval path, so restricted operations may fail.
   */
  skipPermissions?: boolean;
  /** Default model alias when agy_execute omits model/tier (e.g. "flash-medium"). */
  defaultModel?: string;
}

export function getDefaultConfigPath(): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "agy-config.json");
}

export async function loadAgyConfig(configPath = getDefaultConfigPath()): Promise<AgyConfig> {
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as AgyConfig;
    }
  } catch {
    // Missing or malformed config falls back to defaults.
  }
  return {};
}
