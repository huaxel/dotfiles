/**
 * Antigravity (agy) integration for pi.
 *
 * This extension registers two ways to use your Google AI Pro / Antigravity
 * quota from inside pi:
 *
 * 1. Provider mode: if the local `antigravity-bridge` is running on
 *    http://127.0.0.1:7862, it exposes agy's models as an OpenAI-compatible
 *    provider, so you can run `pi --provider antigravity --model gemini-3.5-flash`.
 *
 * 2. Subagent mode: adds an `antigravity_ask` tool and `/antigravity` command
 *    that delegate one-off prompts to `agy --print`, plus an
 *    `antigravity_review` tool and `/antigravity-review` command for agy-powered
 *    git diff review.
 *
 * Environment variables:
 *   - AGY_PATH: path to the `agy` binary (default: agy)
 *   - ANTIGRAVITY_BRIDGE_URL: bridge base URL (default: http://127.0.0.1:7862)
 *   - ANTIGRAVITY_BRIDGE_KEY: optional bearer token for the bridge
 *   - ANTIGRAVITY_DISABLE_PROVIDER: if set, skip registering the provider
 *   - ANTIGRAVITY_DISABLE_SUBAGENT: if set, skip registering tools/commands
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const AGY_PATH = process.env.AGY_PATH || "agy";
const AGY_TIMEOUT_MS = Number(process.env.AGY_TIMEOUT_MS || "300000");
const BRIDGE_URL = (process.env.ANTIGRAVITY_BRIDGE_URL || "http://100.116.127.30:7862").replace(
  /\/$/,
  ""
);
const BRIDGE_KEY = process.env.ANTIGRAVITY_BRIDGE_KEY || "";
const BRIDGE_TIMEOUT_MS = Number(process.env.ANTIGRAVITY_BRIDGE_TIMEOUT_MS || "1500");
const DISABLE_PROVIDER = Boolean(process.env.ANTIGRAVITY_DISABLE_PROVIDER) || /^(1|true|yes)$/i.test(process.env.PI_OFFLINE || "");
const DISABLE_SUBAGENT = Boolean(process.env.ANTIGRAVITY_DISABLE_SUBAGENT);

async function fetchBridgeModels(): Promise<Array<{ id: string }> | undefined> {
  try {
    const res = await fetch(`${BRIDGE_URL}/v1/models`, {
      headers: BRIDGE_KEY ? { Authorization: `Bearer ${BRIDGE_KEY}` } : {},
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(
        `[antigravity] bridge returned ${res.status} ${res.statusText}; provider registration skipped.`
      );
      return undefined;
    }
    const payload = (await res.json()) as { data: Array<{ id: string }> };
    return payload.data;
  } catch (err) {
    console.warn(
      `[antigravity] bridge not reachable at ${BRIDGE_URL}; provider registration skipped.`,
      err instanceof Error ? err.message : String(err)
    );
    return undefined;
  }
}

function isReasoningModel(id: string): boolean {
  return (
    id.includes("pro") || id.includes("opus") || id.includes("thinking") || id.includes("sonnet")
  );
}

async function runAgy(
  prompt: string,
  cwd: string,
  signal?: AbortSignal,
  model?: string
): Promise<string> {
  const args = ["--print", prompt];
  if (model) {
    args.push("--model", model);
  }
  const { stdout, stderr } = await execFileAsync(AGY_PATH, args, {
    cwd,
    timeout: AGY_TIMEOUT_MS,
    signal,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr) {
    console.error("[antigravity] agy stderr:", stderr);
  }
  return stdout;
}

export default async function (pi: ExtensionAPI) {
  // ------------------------------------------------------------------
  // Option 2: register Antigravity as a pi provider via the bridge.
  // ------------------------------------------------------------------
  if (!DISABLE_PROVIDER) {
    const models = await fetchBridgeModels();
    if (models && models.length > 0) {
      pi.registerProvider("antigravity", {
        name: "Antigravity",
        baseUrl: `${BRIDGE_URL}/v1`,
        apiKey: BRIDGE_KEY || "antigravity",
        api: "openai-completions",
        models: models.map((m) => ({
          id: m.id,
          name: m.id,
          reasoning: isReasoningModel(m.id),
          input: ["text"] as const,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1_000_000,
          maxTokens: 8192,
          compat: {
            supportsDeveloperRole: false,
            supportsUsageInStreaming: false,
          },
        })),
      });
      console.log(`[antigravity] registered provider with ${models.length} model(s).`);
    }
  }

  // ------------------------------------------------------------------
  // Option 3: register Antigravity as a subagent/tool inside pi.
  // ------------------------------------------------------------------
  if (!DISABLE_SUBAGENT) {
    pi.registerTool({
      name: "antigravity_ask",
      label: "Antigravity Ask",
      description:
        "Send a one-off prompt to the local Antigravity CLI (agy) and return the final answer. " +
        "Use when the user explicitly asks for Antigravity, Gemini, or agy, or wants a second opinion.",
      parameters: Type.Object({
        prompt: Type.String({
          description: "The prompt to send to agy --print",
        }),
        model: Type.Optional(
          Type.String({
            description: "Optional agy model alias (e.g., gemini-3.5-flash, gemini-3.1-pro)",
          })
        ),
      }),
      promptSnippet: "Delegate a question or task to Antigravity (agy)",
      promptGuidelines: [
        "Use antigravity_ask when the user explicitly asks for Antigravity, Gemini, or agy.",
        "Use antigravity_ask for second opinions, code review, or tasks where Gemini is known to be strong.",
      ],
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const result = await runAgy(params.prompt, ctx.cwd, signal, params.model);
        return {
          content: [{ type: "text", text: result }],
          details: { agy_prompt: params.prompt, model: params.model || "default" },
        };
      },
    });

    pi.registerTool({
      name: "antigravity_review",
      label: "Antigravity Review",
      description: "Ask Antigravity to review the current git diff.",
      parameters: Type.Object({
        focus: Type.Optional(
          Type.String({
            description: "Specific area to focus on (e.g., 'error handling', 'performance')",
          })
        ),
        model: Type.Optional(
          Type.String({
            description: "Optional agy model alias (e.g., gemini-3.5-flash, gemini-3.1-pro)",
          })
        ),
      }),
      promptSnippet: "Review the current git diff with Antigravity (agy)",
      promptGuidelines: [
        "Use antigravity_review when the user asks for a code review or diff review via Antigravity.",
      ],
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const { stdout: diff } = await execFileAsync("git", ["diff"], {
          cwd: ctx.cwd,
          maxBuffer: 10 * 1024 * 1024,
          signal,
        });

        if (!diff.trim()) {
          return {
            content: [{ type: "text", text: "No uncommitted changes to review." }],
            details: {},
          };
        }

        const prompt = [
          "Review the following git diff.",
          params.focus ? `Focus especially on: ${params.focus}` : "",
          "",
          diff,
        ]
          .filter(Boolean)
          .join("\n");

        const result = await runAgy(prompt, ctx.cwd, signal, params.model);
        return {
          content: [{ type: "text", text: result }],
          details: { diff_bytes: diff.length, model: params.model || "default" },
        };
      },
    });

    pi.registerCommand("antigravity", {
      description: "Ask Antigravity (agy) a one-off question",
      handler: async (args, ctx) => {
        if (!args) {
          ctx.ui.notify("Usage: /antigravity <prompt>", "error");
          return;
        }
        ctx.ui.notify("Asking Antigravity...", "info");
        try {
          const result = await runAgy(args, ctx.cwd);
          pi.sendMessage(
            {
              customType: "antigravity",
              content: result,
              display: true,
              details: {},
            },
            { triggerTurn: false, deliverAs: "followUp" }
          );
        } catch (err) {
          ctx.ui.notify(
            `Antigravity failed: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
        }
      },
    });

    pi.registerCommand("antigravity-review", {
      description: "Review the current git diff with Antigravity",
      handler: async (args, ctx) => {
        try {
          const { stdout: diff } = await execFileAsync("git", ["diff"], {
            cwd: ctx.cwd,
            maxBuffer: 10 * 1024 * 1024,
          });
          if (!diff.trim()) {
            ctx.ui.notify("No uncommitted changes to review.", "error");
            return;
          }
          const prompt = [
            "Review the following git diff.",
            args || "Focus on correctness, security, performance, and maintainability.",
            "",
            diff,
          ].join("\n");

          ctx.ui.notify("Antigravity is reviewing the diff...", "info");
          const result = await runAgy(prompt, ctx.cwd);
          pi.sendMessage(
            {
              customType: "antigravity",
              content: result,
              display: true,
              details: {},
            },
            { triggerTurn: false, deliverAs: "followUp" }
          );
        } catch (err) {
          ctx.ui.notify(
            `Antigravity review failed: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
        }
      },
    });
  }
}
