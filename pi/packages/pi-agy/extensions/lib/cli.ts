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

export interface AgyOptions {
  prompt: string;
  model?: AgyModel;
  tier?: "flash" | "flash-lo" | "pro";
  mode?: "plan" | "accept-edits" | "sandbox";
  dir: string;
  timeout_ms: number;
  conversation_id?: string;
  continue?: boolean;
  stream?: boolean;
}

const PREFLIGHT_TIMEOUT_MS = 10_000;
const MAX_CAPTURE_BYTES = 64 * 1024;

const MODEL_MAP: Record<AgyModel, string> = {
  "flash-low": "gemini-3.6-flash-low",
  "flash-medium": "gemini-3.6-flash-medium",
  "flash-high": "gemini-3.6-flash-high",
  "pro-low": "gemini-3.1-pro-low",
  "pro-high": "gemini-3.1-pro-high",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6-thinking",
  "gpt-oss": "gpt-oss-120b-medium",
};

const TIER_MAP: Record<NonNullable<AgyOptions["tier"]>, string> = {
  flash: MODEL_MAP["flash-high"],
  "flash-lo": MODEL_MAP["flash-low"],
  pro: MODEL_MAP["pro-high"],
};

export function buildAgyArgs(options: AgyOptions): string[] {
  const model = options.model
    ? MODEL_MAP[options.model]
    : options.tier
      ? TIER_MAP[options.tier]
      : MODEL_MAP["flash-medium"];
  const timeoutSec = Math.ceil(options.timeout_ms / 1000);
  const mode = options.mode ?? "accept-edits";
  const writes = mode === "accept-edits";
  const useStream = options.stream ?? true;
  const structured = mode !== "accept-edits" || useStream;

  const args = [
    "--model",
    model,
    "--print-timeout",
    `${timeoutSec}s`,
    "--add-dir",
    options.dir,
    ...(mode === "sandbox" ? ["--sandbox"] : ["--mode", mode]),
    ...(writes ? ["--dangerously-skip-permissions"] : []),
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

export async function checkAgyHealth(cwd: string, signal?: AbortSignal): Promise<void> {
  await runPreflightSpawn(["--version"], cwd, signal, "agy health check");
}

export async function checkAgyConnectivity(cwd: string, signal?: AbortSignal): Promise<void> {
  await runPreflightSpawn(["models"], cwd, signal, "agy connectivity check");
}

async function runPreflightSpawn(
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  label: string,
): Promise<void> {
  const spawn = getSpawn();
  const child = spawn("agy", args, {
    cwd,
    stdio: ["ignore", "ignore", "pipe"],
    timeout: PREFLIGHT_TIMEOUT_MS,
    signal,
  });

  const stderr: Buffer[] = [];
  let stderrBytes = 0;
  child.stderr.on("data", (d: Buffer) => {
    stderrBytes = appendBounded(stderr, stderrBytes, d);
  });

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
}

export function spawnAgy(options: AgyOptions, signal: AbortSignal): Promise<string> {
  return spawnAgyInternal(options, signal).then((result) => result.response);
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
  const alignedTimeout = Math.ceil(options.timeout_ms / 1000) * 1000 + 5000;

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
      if (!onProgress) return;

      lineBuffer += d.toString("utf8");
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseStreamLine(line);
        if (!parsed) continue;
        runResult = accumulateRunResult(parsed, runResult);
        const progress = formatStepProgress(parsed);
        if (progress) onProgress(progress);
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

        if (lineBuffer.trim() && onProgress) {
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
