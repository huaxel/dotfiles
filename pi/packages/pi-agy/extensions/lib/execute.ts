import { stat } from "node:fs/promises";

import {
  buildAgyPrompt,
  detectVerifyCommand,
  spawnAgyStream,
  type AgyModel,
} from "./cli.js";
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

  return withDirLock(
    options.dir,
    async () => {
      if (!(await stat(options.dir)).isDirectory()) {
        throw new Error(`Working directory is not a directory: ${options.dir}`);
      }

      await runPreflight(options.dir, abortSignal);

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

      onProgress?.(
        `agy: starting (${options.model ?? "flash-medium"}, ${options.mode})…`,
      );

      const run = await spawnAgyStream(
        {
          prompt: finalPrompt,
          model: options.model,
          tier: options.tier,
          mode: options.mode,
          dir: options.dir,
          timeout_ms: options.timeout_ms,
          conversation_id: conversationId,
          continue: options.continue,
          stream: options.stream ?? true,
        },
        abortSignal,
        onProgress,
      );

      if (run.conversation_id) {
        await saveSession(options.dir, run.conversation_id, options.model);
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
          model: options.model ?? "flash-medium",
          dir: options.dir,
          conversation_id: run.conversation_id,
          verify_cmd: verifyCmd,
          usage: run.usage,
          duration_seconds: run.duration_seconds,
        },
      };
    },
    abortSignal,
  );
}
