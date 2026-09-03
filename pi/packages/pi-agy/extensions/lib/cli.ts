import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import {
  accumulateRunResult,
  finalizeRunResult,
  formatStepProgress,
  parseStreamLine,
  type AgyProgressHandler,
  type AgyRunResult,
  type AgyStreamLine,
} from "./stream.js";

export { detectVerifyCommand } from "./verify.js";
export { parseJsonResponse } from "./parse.js";

const INSTALL_HINT = "Install agy: curl -fsSL https://antigravity.google/cli/install.sh | bash";

export type AgyModel =
  | "flash-low"
  | "flash-medium"
  | "flash-high"
  | "pro-low"
  | "pro-high"
  | "sonnet"
  | "opus"
  | "gpt-oss";

export const AGY_MODEL_ALIASES: readonly AgyModel[] = [
  "flash-low",
  "flash-medium",
  "flash-high",
  "pro-low",
  "pro-high",
  "sonnet",
  "opus",
  "gpt-oss",
];

export function isAgyModel(value: unknown): value is AgyModel {
  return typeof value === "string" && (AGY_MODEL_ALIASES as readonly string[]).includes(value);
}

export type AgyEffort = "low" | "medium" | "high";

export interface AgyOptions {
  prompt: string;
  model?: AgyModel;
  tier?: "flash" | "flash-lo" | "pro";
  effort?: AgyEffort;
  mode?: "plan" | "accept-edits" | "sandbox";
  dir: string;
  timeout_ms: number;
  conversation_id?: string;
  continue?: boolean;
  stream?: boolean;
  skipPermissions?: boolean;
}

const PREFLIGHT_TIMEOUT_MS = 10_000;
// Raw stdout capture bound; only used as the non-streaming fallback — the
// stream-json path accumulates results incrementally and is not capped by it.
const MAX_CAPTURE_BYTES = 64 * 1024;

// Static fallback for when `agy models` output is unavailable. The live
// catalog (updated during preflight) overrides these per alias.
const MODEL_MAP: Record<AgyModel, string> = {
  "flash-low": "gemini-3.8-flash-low",
  "flash-medium": "gemini-3.8-flash-medium",
  "flash-high": "gemini-3.8-flash-high",
  "pro-low": "gemini-3.1-pro-low",
  "pro-high": "gemini-3.1-pro-high",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6-thinking",
  "gpt-oss": "gpt-oss-120b-medium",
};

const TIER_MAP: Record<NonNullable<AgyOptions["tier"]>, AgyModel> = {
  flash: "flash-high",
  "flash-lo": "flash-low",
  pro: "pro-high",
};

/** alias → pattern matching concrete model ids in `agy models` output. */
const CATALOG_PATTERNS: Record<AgyModel, RegExp> = {
  "flash-low": /^gemini-\d+(?:\.\d+)*-flash-low$/,
  "flash-medium": /^gemini-\d+(?:\.\d+)*-flash-medium$/,
  "flash-high": /^gemini-\d+(?:\.\d+)*-flash-high$/,
  "pro-low": /^gemini-\d+(?:\.\d+)*-pro-low$/,
  "pro-high": /^gemini-\d+(?:\.\d+)*-pro-high$/,
  sonnet: /^claude-sonnet-[\w.-]+$/,
  opus: /^claude-opus-[\w.-]+$/,
  "gpt-oss": /^gpt-oss-[\w.-]+$/,
};

export type AgyModelCatalog = Partial<Record<AgyModel, string>>;

let modelCatalog: AgyModelCatalog = {};

/**
 * Parse `agy models` output into alias → concrete model id. Newer model
 * generations win over older ones so aliases track the latest catalog.
 */
export function parseModelCatalog(output: string): AgyModelCatalog {
  const found: AgyModelCatalog = {};
  for (const line of output.split("\n")) {
    const id = line.trim().split(/\s+/)[0] ?? "";
    if (!id) continue;
    for (const [alias, pattern] of Object.entries(CATALOG_PATTERNS) as Array<[AgyModel, RegExp]>) {
      if (pattern.test(id) && compareModelIds(id, found[alias] ?? "") > 0) {
        found[alias] = id;
      }
    }
  }
  return found;
}

function compareModelIds(a: string, b: string): number {
  if (!b) return 1;
  const versionA = /^gemini-(\d+(?:\.\d+)*)-/.exec(a)?.[1];
  const versionB = /^gemini-(\d+(?:\.\d+)*)-/.exec(b)?.[1];
  if (versionA && versionB) return compareDottedVersions(versionA, versionB);
  // Numeric-aware compare so claude-sonnet-4-10 sorts above claude-sonnet-4-6.
  return compareNatural(a, b);
}

function compareNatural(a: string, b: string): number {
  const sa = a.split(/(\d+)/);
  const sb = b.split(/(\d+)/);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const pa = sa[i] ?? "";
    const pb = sb[i] ?? "";
    if (pa === pb) continue;
    if (/^\d+$/.test(pa) && /^\d+$/.test(pb)) {
      const na = Number(pa);
      const nb = Number(pb);
      if (na !== nb) return na < nb ? -1 : 1;
    }
    return pa < pb ? -1 : 1;
  }
  return 0;
}

function compareDottedVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const delta = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

/** Merge freshly observed catalog entries over the in-process catalog. */
export function updateModelCatalog(catalog: AgyModelCatalog): void {
  modelCatalog = { ...modelCatalog, ...catalog };
}

export function getModelCatalog(): AgyModelCatalog {
  return { ...modelCatalog };
}

/** Test helper — drop in-process catalog state. */
export function resetModelCatalog(): void {
  modelCatalog = {};
}

/** Resolve explicit model or legacy tier to the internal alias. */
export function resolveAgyModelAlias(
  model?: AgyModel,
  tier?: AgyOptions["tier"],
): AgyModel | undefined {
  return model ?? (tier ? TIER_MAP[tier] : undefined);
}

/** Resolve a model alias to a concrete agy model id, preferring the live catalog. */
export function resolveAgyModelId(model?: AgyModel, tier?: AgyOptions["tier"]): string {
  const alias = resolveAgyModelAlias(model, tier) ?? "flash-medium";
  return modelCatalog[alias] ?? MODEL_MAP[alias];
}

const TRANSIENT_FAILURE_PATTERN =
  /rate.?limit|429|overloaded|temporarily unavailable|network|connection (reset|refused)|econnreset|etimedout|socket hang up|\b50[023]\b/i;

/** Heuristic for transient agy failures that are safe to retry once. */
export function isTransientAgyFailure(message: string): boolean {
  return TRANSIENT_FAILURE_PATTERN.test(message);
}

export function buildAgyArgs(options: AgyOptions): string[] {
  const model = resolveAgyModelId(options.model, options.tier);
  const timeoutSec = Math.ceil(options.timeout_ms / 1000);
  const mode = options.mode ?? "accept-edits";
  const writes = mode === "accept-edits";
  const skipPermissions = options.skipPermissions ?? true;
  const useStream = options.stream ?? true;
  const structured = mode !== "accept-edits" || useStream;

  const args = [
    "--model",
    model,
    "--print-timeout",
    `${timeoutSec}s`,
    "--add-dir",
    options.dir,
    // Task text must never be interpreted as agy slash commands or skills.
    "--disable-slash-commands",
    ...(mode === "sandbox" ? ["--sandbox"] : ["--mode", mode]),
    ...(writes && skipPermissions ? ["--dangerously-skip-permissions"] : []),
    ...(options.effort ? ["--effort", options.effort] : []),
  ];

  if (options.continue) {
    args.push("--continue");
  } else if (options.conversation_id) {
    args.push("--conversation", options.conversation_id);
  }

  if (structured) {
    args.push("--output-format", useStream ? "stream-json" : "json");
  }

  args.push("-p", options.prompt);
  return args;
}

export function buildAgyPrompt(
  prompt: string,
  mode: "plan" | "accept-edits" | "sandbox",
  useDigest: boolean,
  verifyCmd: string | null,
): string {
  const lines: string[] = [];
  if (mode === "plan") lines.push("Explore and produce an implementation plan only; do not edit.");
  else if (mode === "sandbox") lines.push("Work inside the sandbox; changes are isolated for preview.");
  else if (verifyCmd) lines.push(`After editing, run \`${verifyCmd}\` and fix failures until it passes.`);
  if (useDigest) lines.push("Use compact digests, not full file contents.");
  lines.push(prompt);
  return lines.join("\n");
}

function getSpawn() {
  return _require("node:child_process").spawn;
}

function appendBounded(chunks: Buffer[], total: number, data: Buffer): number {
  const remaining = MAX_CAPTURE_BYTES - total;
  if (remaining > 0) chunks.push(data.subarray(0, remaining));
  return Math.min(MAX_CAPTURE_BYTES, total + data.length);
}

export async function checkAgyHealth(
  cwd: string,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<void> {
  await runPreflightCommand(["--version"], cwd, signal, "agy health check", false, timeoutMs);
}

export async function checkAgyConnectivity(
  cwd: string,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<void> {
  const output = await runPreflightCommand(
    ["models"],
    cwd,
    signal,
    "agy connectivity check",
    true,
    timeoutMs,
  );
  const catalog = parseModelCatalog(output);
  if (Object.keys(catalog).length > 0) updateModelCatalog(catalog);
}

async function runPreflightCommand(
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  label: string,
  capture: boolean,
  timeoutMs?: number,
): Promise<string> {
  const spawn = getSpawn();
  const timeout = Math.max(1, Math.min(PREFLIGHT_TIMEOUT_MS, timeoutMs ?? PREFLIGHT_TIMEOUT_MS));
  const child = spawn("agy", args, {
    cwd,
    stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"],
    timeout,
    signal,
  });

  const stderr: Buffer[] = [];
  let stderrBytes = 0;
  child.stderr.on("data", (d: Buffer) => {
    stderrBytes = appendBounded(stderr, stderrBytes, d);
  });

  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  if (capture) {
    child.stdout?.on("data", (d: Buffer) => {
      stdoutBytes = appendBounded(stdout, stdoutBytes, d);
    });
  }

  let settled = false;

  await new Promise<void>((resolve, reject) => {
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    child.on("error", (err: Error) => {
      done(() => {
        if (signal?.aborted) reject(new Error(`${label} was cancelled`));
        else if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error(`Antigravity CLI is not installed. ${INSTALL_HINT}`));
        } else reject(new Error(`${label} failed: ${err.message}`));
      });
    });

    child.on("close", (code: number | null) => {
      done(() => {
        if (signal?.aborted) {
          reject(new Error(`${label} was cancelled`));
          return;
        }
        if (code === 0) resolve();
        else {
          const msg = Buffer.concat(stderr).toString("utf8").trim();
          const status = code === null ? "timed out" : `exit ${code}`;
          const authHint =
            args[0] === "--version"
              ? "Antigravity CLI is not authenticated or not working"
              : "agy connectivity check failed";
          reject(new Error(`${authHint} (${status}). ${msg || "Run 'agy' interactively to authenticate."}`));
        }
      });
    });
  });

  const stdoutText = capture ? Buffer.concat(stdout).toString("utf8") : "";
  // Stdout only: stderr diagnostics must never leak into catalog parsing.
  return stdoutText;
}

export function spawnAgy(options: AgyOptions, signal: AbortSignal): Promise<string> {
  return spawnAgyInternal(options, signal).then((result) => result.response);
}

/** Real agy work (tool steps / model responses), as opposed to lifecycle chatter. */
function isActivityProgress(parsed: AgyStreamLine): boolean {
  const step = parsed.step_update;
  return step?.step_type === "tool" || step?.step_type === "agent_response";
}

export function spawnAgyStream(
  options: AgyOptions,
  signal: AbortSignal,
  onProgress?: AgyProgressHandler,
): Promise<AgyRunResult> {
  return spawnAgyInternal(options, signal, onProgress);
}

function spawnAgyInternal(
  options: AgyOptions,
  signal: AbortSignal,
  onProgress?: AgyProgressHandler,
): Promise<AgyRunResult> {
  const spawn = getSpawn();
  const args = buildAgyArgs(options);
  // The parent process owns the hard deadline; agy's second-based timeout is
  // rounded up, so do not add grace time here.
  const alignedTimeout = Math.max(1, options.timeout_ms);

  return new Promise<AgyRunResult>((resolve, reject) => {
    const child = spawn("agy", args, {
      cwd: options.dir,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
      timeout: alignedTimeout,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let lineBuffer = "";
    let runResult: AgyRunResult = { response: "" };

    child.stdout.on("data", (d: Buffer) => {
      stdoutBytes = appendBounded(stdout, stdoutBytes, d);
      lineBuffer += d.toString("utf8");
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseStreamLine(line);
        if (!parsed) continue;
        runResult = accumulateRunResult(parsed, runResult);
        if (onProgress) {
          const progress = formatStepProgress(parsed);
          if (progress) onProgress(progress, isActivityProgress(parsed) ? "activity" : "status");
        }
      }
    });

    child.stderr.on("data", (d: Buffer) => {
      stderrBytes = appendBounded(stderr, stderrBytes, d);
    });

    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    child.on("error", (err: Error) => {
      done(() => {
        if (signal.aborted) reject(new Error("agy was cancelled"));
        else if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error(`Antigravity CLI not found in PATH. ${INSTALL_HINT}`));
        } else reject(new Error(`agy spawn failed: ${err.message}`));
      });
    });

    child.on("close", (code: number | null, sig: string | null) => {
      done(() => {
        const out = Buffer.concat(stdout).toString("utf8");
        const err = Buffer.concat(stderr).toString("utf8");

        if (sig === "SIGTERM" || sig === "SIGKILL" || code === null) {
          reject(new Error(`agy was cancelled (${sig || "timeout"})`));
          return;
        }

        if (code !== 0) {
          const detail = (err || out).slice(0, 2000).trim();
          reject(new Error(`agy exited with code ${code}:\n${detail || "(no output)"}`));
          return;
        }

        if (lineBuffer.trim()) {
          const parsed = parseStreamLine(lineBuffer);
          if (parsed) runResult = accumulateRunResult(parsed, runResult);
        }

        // agy writes diagnostics to stderr even on successful runs. Keep it
        // out of the response so JSON/stream parsing remains deterministic.
        resolve(finalizeRunResult(out, runResult));
      });
    });
  });
}

// Re-export for tests that imported detectVerifyCommand from cli in upstream.
export async function detectVerifyCommandFromPackageJson(cwd: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
    if (pkg?.scripts?.test) return "npm test";
  } catch {
    // ignore
  }
  return null;
}
