import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { isAgyModel, type AgyModel } from "./cli.js";

const execFileAsync = promisify(execFile);

const COMMAND_TTL_MS = 5 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 5_000;

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
  /**
   * Shell command whose stdout is used as the default model alias when
   * `defaultModel` is unset — e.g. a quota-aware resolver. Must print a
   * single valid alias; failures and invalid output fall back to the
   * built-in default. Result cached for a few minutes per process.
   *
   * Trust boundary: executed verbatim via `sh -c`. Only point this at a
   * command you control — the config file is user-owned, single-user
   * dotfiles context.
   */
  defaultModelCommand?: string;
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

let cachedCommandAlias: { at: number; alias?: AgyModel } | undefined;

/**
 * Resolve the default model alias: an explicit `defaultModel` always wins;
 * otherwise `defaultModelCommand` runs (cached) and its output is validated.
 */
export async function resolveDefaultModel(config: AgyConfig): Promise<AgyModel | undefined> {
  if (isAgyModel(config.defaultModel)) return config.defaultModel;
  const command = config.defaultModelCommand?.trim();
  if (!command) return undefined;

  if (cachedCommandAlias && Date.now() - cachedCommandAlias.at < COMMAND_TTL_MS) {
    return cachedCommandAlias.alias;
  }

  const alias = await runDefaultModelCommand(command);
  cachedCommandAlias = { at: Date.now(), alias };
  return alias;
}

async function runDefaultModelCommand(command: string): Promise<AgyModel | undefined> {
  try {
    const { stdout } = await execFileAsync("sh", ["-c", command], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 16 * 1024,
    });
    const alias = stdout.trim().split("\n")[0]?.trim() ?? "";
    return isAgyModel(alias) ? alias : undefined;
  } catch {
    return undefined;
  }
}

/** Test helper — drop the cached default-model command result. */
export function resetDefaultModelCache(): void {
  cachedCommandAlias = undefined;
}
