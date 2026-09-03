import { stat } from "node:fs/promises";

import {
  buildAgyPrompt,
  detectVerifyCommand,
  isTransientAgyFailure,
  spawnAgyStream,
  type AgyEffort,
  type AgyModel,
} from "./cli.js";
import { loadAgyConfig, resolveDefaultModel } from "./config.js";
import type { AgyUsage } from "./stream.js";
import { withDirLock } from "./lock.js";
import { summarizeGitDiff } from "./postflight.js";
import { runPreflight } from "./preflight.js";
import { getSession, saveSession } from "./sessions.js";
import { parseJsonResponse } from "./parse.js";

export type AgyMode = "plan" | "accept-edits" | "sandbox";

export interface AgyExecutionOptions {
  prompt: string;
  model?: AgyModel;
  tier?: "flash" | "flash-lo" | "pro";
  effort?: AgyEffort;
  mode: AgyMode;
  dir: string;
  digest?: boolean;
  timeout_ms: number;
  conversation_id?: string;
  continue?: boolean;
  new_session?: boolean;
  stream?: boolean;
}

export interface AgyExecutionDetails {
  mode: AgyMode;
  model: AgyModel | "flash-medium";
  dir: string;
  conversation_id?: string;
  verify_cmd: string | null;
  permissions_skipped?: boolean;
  effort?: AgyEffort;
  usage?: AgyUsage;
  duration_seconds?: number;
}

export interface AgyExecutionResult {
  text: string;
  details: AgyExecutionDetails;
}

export async function executeAgyTask(
  options: AgyExecutionOptions,
  signal: AbortSignal | undefined,
  onProgress?: (message: string) => void,
): Promise<AgyExecutionResult> {
  const abortSignal = signal ?? new AbortController().signal;
  // The budget covers config resolution + lock wait + preflight + the agy run
  // itself, so a slow default-model command cannot silently eat into it.
  const startedAt = Date.now();
  const config = await loadAgyConfig();
  // Resolution order: explicit call model → static defaultModel →
  // defaultModelCommand (e.g. quota-aware resolver) → flash-medium.
  const model = options.model ?? (await resolveDefaultModel(config));
  const skipPermissions = config.skipPermissions !== false;

  // A call queued behind a long run cannot silently exceed its own timeout.

  return withDirLock(
    options.dir,
    async () => {
      if (!(await stat(options.dir)).isDirectory()) {
        throw new Error(`Working directory is not a directory: ${options.dir}`);
      }

      let conversationId = options.conversation_id;
      if (
        !conversationId &&
        !options.continue &&
        options.new_session !== true
      ) {
        const prior = await getSession(options.dir);
        if (prior?.last_conversation_id && options.new_session === false) {
          conversationId = prior.last_conversation_id;
        }
      }

      const useDigest = options.digest ?? options.mode !== "accept-edits";
      const verifyCmd =
        options.mode === "accept-edits"
          ? await detectVerifyCommand(options.dir)
          : null;
      const finalPrompt = buildAgyPrompt(
        options.prompt,
        options.mode,
        useDigest,
        verifyCmd,
      );

      const run = await runWithTransientRetry(async (trackProgress) => {
        await runPreflight(options.dir, abortSignal);

        const remainingMs = Math.max(options.timeout_ms - (Date.now() - startedAt), 1_000);
        // Emitted via onProgress directly: progress tracking (and therefore
        // retry eligibility) must only reflect activity from agy itself.
        onProgress?.(
          `agy: starting (${model ?? "flash-medium"}, ${options.mode}${options.effort ? `, effort ${options.effort}` : ""})…`,
        );

        return spawnAgyStream(
          {
            prompt: finalPrompt,
            model,
            tier: options.tier,
            effort: options.effort,
            mode: options.mode,
            dir: options.dir,
            timeout_ms: remainingMs,
            conversation_id: conversationId,
            continue: options.continue,
            stream: options.stream ?? true,
            skipPermissions,
          },
          abortSignal,
          trackProgress,
        );
      }, onProgress);

      if (run.conversation_id) {
        await saveSession(options.dir, run.conversation_id, model);
      }

      let text = run.response;
      if (options.mode !== "accept-edits") {
        text = parseJsonResponse(run.response) || run.response;
      }

      if (options.mode === "accept-edits") {
        const diffSummary = await summarizeGitDiff(options.dir, abortSignal);
        if (diffSummary) text = `${text}\n\n${diffSummary}`;
      }

      return {
        text,
        details: {
          mode: options.mode,
          model: model ?? "flash-medium",
          dir: options.dir,
          conversation_id: run.conversation_id,
          verify_cmd: verifyCmd,
          permissions_skipped: options.mode === "accept-edits" ? skipPermissions : false,
          effort: options.effort,
          usage: run.usage,
          duration_seconds: run.duration_seconds,
        },
      };
    },
    abortSignal,
    options.timeout_ms,
  );
}

/**
 * Retry once when agy fails before emitting any activity (tool step or model
 * response) with a transient error (rate limit, network blip). Zero activity
 * means no tool steps ran, so the retry cannot double-apply edits.
 */
async function runWithTransientRetry<T>(
  attempt: (trackProgress: (message: string) => void) => Promise<T>,
  onProgress?: (message: string) => void,
): Promise<T> {
  for (let tries = 0; ; tries++) {
    let sawActivity = false;
    const trackProgress = (message: string, kind?: "status" | "activity") => {
      if (kind === "activity") sawActivity = true;
      onProgress?.(message);
    };
    try {
      return await attempt(trackProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (tries === 0 && !sawActivity && isTransientAgyFailure(message)) {
        onProgress?.("agy: transient failure before any work — retrying once…");
        continue;
      }
      throw error;
    }
  }
}
