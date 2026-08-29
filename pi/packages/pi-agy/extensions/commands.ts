import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { AgyModel } from "./lib/cli.js";
import { executeAgyTask } from "./lib/execute.js";
import { truncate } from "./lib/output.js";

const MODEL_ALIASES: Record<string, AgyModel> = {
  flash: "flash-medium",
  "flash-low": "flash-low",
  "flash-medium": "flash-medium",
  "flash-high": "flash-high",
  pro: "pro-high",
  "pro-low": "pro-low",
  "pro-high": "pro-high",
  sonnet: "sonnet",
  opus: "opus",
  "gpt-oss": "gpt-oss",
};

const MODEL_KEYS = Object.keys(MODEL_ALIASES);

const MODEL_OPTIONS = [
  "flash — fast, cheap (Gemini Flash medium)",
  "flash-low — trivial / high-volume",
  "flash-high — harder agentic work",
  "pro — deep reasoning (Gemini Pro high)",
  "pro-low — pro, lighter reasoning",
  "pro-high — max Gemini reasoning",
  "sonnet — Claude default (review/code)",
  "opus — Claude hard problems",
  "gpt-oss — open-model alternative",
];

const MODE_OPTIONS = [
  "accept-edits — writes files (default)",
  "plan — exploration, no edits",
  "sandbox — isolated preview",
];

const MODE_KEYS = ["accept-edits", "plan", "sandbox"] as const;

export interface AgyCommandArgs {
  mode?: "plan" | "accept-edits" | "sandbox";
  model?: AgyModel;
  prompt?: string;
}

/** Parse `/agy [mode] [model] <prompt>` — e.g. `/agy flash fix git conflicts`. Only fills what was provided. */
export function parseAgyCommandArgs(args: string): AgyCommandArgs {
  let rest = args.trim();
  const parsed: AgyCommandArgs = {};

  const first = readToken(rest);
  const mode = first?.value.toLowerCase();
  if (first && mode && MODE_KEYS.includes(mode as (typeof MODE_KEYS)[number])) {
    parsed.mode = mode as AgyCommandArgs["mode"];
    rest = rest.slice(first.end).trimStart();
  }

  const modelToken = readToken(rest);
  const model = modelToken?.value.toLowerCase();
  if (modelToken && model && MODEL_ALIASES[model]) {
    parsed.model = MODEL_ALIASES[model];
    rest = rest.slice(modelToken.end).trimStart();
  }

  if (rest) parsed.prompt = rest;
  return parsed;
}

function readToken(value: string): { value: string; end: number } | undefined {
  const match = /^\S+/.exec(value);
  return match ? { value: match[0], end: match[0].length } : undefined;
}

/**
 * Register the human-callable `/agy [mode] [model] <prompt>` command.
 *
 * The command fills missing args with dialogs, confirms write-capable runs, and
 * executes agy directly. This keeps the confirmed parameters authoritative and
 * avoids requiring a second LLM turn or custom TUI surface.
 */
export function registerAgyCommand(pi: ExtensionAPI): void {
  pi.registerCommand("agy", {
    description:
      "Run agy directly: /agy [mode] [model] <prompt>. With missing parts, prompts interactively.",
    getArgumentCompletions: (prefix: string) => {
      const tokens = prefix.trim().split(/\s+/).filter(Boolean);
      const p = prefix.toLowerCase();

      if (tokens.length === 1 && MODE_KEYS.includes(tokens[0] as (typeof MODE_KEYS)[number])) {
        return MODEL_KEYS.map((k) => ({ value: k, label: k }));
      }
      if (tokens.length <= 1) {
        const modes = MODE_KEYS.filter((m) => m.startsWith(tokens[0] ?? ""));
        const models = MODEL_KEYS.filter((k) => k.startsWith(p));
        return [
          ...modes.map((m) => ({ value: m, label: m })),
          ...models.map((m) => ({ value: m, label: m })),
        ];
      }
      return null;
    },
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/agy requires interactive (TUI) mode", "error");
        return;
      }

      // 1. Fill gaps interactively (mode → model → prompt), or use the fast path when fully specified.
      const parsed = parseAgyCommandArgs(args);

      let mode: Exclude<AgyCommandArgs["mode"], undefined> | undefined = parsed.mode;
      if (!mode) {
        const pick = await ctx.ui.select("agy mode", MODE_OPTIONS);
        if (!pick) {
          ctx.ui.notify("agy: cancelled", "info");
          return;
        }
        mode = optionKey(pick) as Exclude<AgyCommandArgs["mode"], undefined>;
      }

      let model = parsed.model;
      if (!model) {
        const pick = await ctx.ui.select("agy model", MODEL_OPTIONS);
        if (!pick) {
          ctx.ui.notify("agy: cancelled", "info");
          return;
        }
        model = MODEL_ALIASES[optionKey(pick)] ?? "flash-medium";
      }

      let prompt = parsed.prompt;
      if (!prompt) {
        const text = await ctx.ui.editor("agy task", "");
        if (!text?.trim()) {
          ctx.ui.notify("agy: cancelled (empty task)", "info");
          return;
        }
        prompt = text.trim();
      }

      const cwd = ctx.cwd;

      // 2. Confirm before writing files.
      if (mode === "accept-edits") {
        const ok = await ctx.ui.confirm(
          "Run agy (accept-edits)?",
          `model: ${model}\ndir: ${cwd}\n\ntask: ${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}`,
        );
        if (!ok) {
          ctx.ui.notify("agy: cancelled", "info");
          return;
        }
      }

      // 3. Execute directly so the confirmed parameters cannot be changed by
      //    a second LLM turn and the command works even when tools are limited.
      try {
        await ctx.waitForIdle();
        ctx.ui.setStatus("agy", `starting (${model} · ${mode})`);
        const result = await executeAgyTask(
          {
            prompt,
            model,
            mode,
            dir: cwd,
            timeout_ms: 300_000,
            new_session: true,
            stream: true,
          },
          ctx.signal,
          (progress) => ctx.ui.setStatus("agy", progress.slice(0, 200)),
        );
        ctx.ui.setStatus("agy", undefined);
        ctx.ui.notify(truncate(result.text || "(empty response)", 4000), "info");
      } catch (error) {
        ctx.ui.setStatus("agy", undefined);
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`agy failed: ${message}`, "error");
      }
    },
  });
}

function optionKey(option: string): string {
  return option.split(" — ")[0] ?? option;
}
