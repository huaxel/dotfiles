import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { AgyModel } from "./lib/cli.js";

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

export interface AgyCommandArgs {
  mode?: "plan" | "accept-edits" | "sandbox";
  model?: AgyModel;
  prompt?: string;
}

/** Parse `/agy [plan|sandbox] [model] <prompt>` — e.g. `/agy flash fix git conflicts`. Only fills what was provided. */
export function parseAgyCommandArgs(args: string): AgyCommandArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const parsed: AgyCommandArgs = {};

  if (tokens[0] === "plan" || tokens[0] === "sandbox") {
    parsed.mode = tokens.shift() as AgyCommandArgs["mode"];
  }

  if (tokens[0] && MODEL_ALIASES[tokens[0].toLowerCase()]) {
    parsed.model = MODEL_ALIASES[tokens[0].toLowerCase()];
    tokens.shift();
  }

  const prompt = tokens.join(" ");
  if (prompt) parsed.prompt = prompt;
  return parsed;
}

/**
 * Register the human-callable `/agy [plan|sandbox] [model] <prompt>` command.
 *
 * The command is a thin shim: it fills missing args with dialogs, then delegates
 * to the existing `agy_execute` tool via a user message. The tool runs in the
 * normal chat flow — progress streams inline as a tool row (same as bash/grep),
 * and the result lands in the transcript — with zero custom TUI surface.
 */
export function registerAgyCommand(pi: ExtensionAPI): void {
  pi.registerCommand("agy", {
    description:
      "Run agy via the agy_execute tool: /agy [plan|sandbox] [model] <prompt>. With missing parts, prompts interactively.",
    getArgumentCompletions: (prefix) => {
      const tokens = prefix.trim().split(/\s+/).filter(Boolean);
      const p = prefix.toLowerCase();

      if (tokens.length === 1 && (tokens[0] === "plan" || tokens[0] === "sandbox")) {
        return MODEL_KEYS.map((k) => ({ value: k, label: k }));
      }
      if (tokens.length <= 1) {
        const modes = ["plan", "sandbox"].filter((m) => m.startsWith(tokens[0] ?? ""));
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

      // 1. Fill gaps interactively (mode → model → prompt), or fast path when fully specified.
      const parsed = parseAgyCommandArgs(args);

      let mode = parsed.mode;
      if (!mode) {
        const pick = await ctx.ui.select("agy mode", MODE_OPTIONS);
        if (!pick) {
          ctx.ui.notify("agy: cancelled", "info");
          return;
        }
        mode = optionKey(pick) as AgyCommandArgs["mode"];
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

      // 3. Delegate to the agy_execute tool. The agent calls the tool, which
      //    renders as a normal tool row with streaming progress in the chat.
      const instruction = [
        "Run the agy_execute tool now with exactly these parameters:",
        `- mode: ${mode}`,
        `- model: ${model}`,
        `- dir: ${cwd}`,
        `- prompt: ${JSON.stringify(prompt)}`,
        "Report the tool result. Do not skip, paraphrase, or defer the tool call.",
      ].join("\n");

      pi.sendUserMessage(instruction, { deliverAs: "steer" });
      ctx.ui.notify(`agy: delegated (${model} · ${mode})`, "info");
    },
  });
}

function optionKey(option: string): string {
  return option.split(" — ")[0] ?? option;
}
