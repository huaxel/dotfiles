import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { spawnAgyStream, type AgyModel } from "./lib/cli.js";
import { withDirLock } from "./lib/lock.js";
import { summarizeGitDiff } from "./lib/postflight.js";
import { runPreflight } from "./lib/preflight.js";
import { saveSession } from "./lib/sessions.js";

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
const PANEL_VIEWPORT = 30;

export interface AgyCommandArgs {
  mode: "plan" | "accept-edits" | "sandbox";
  model: AgyModel;
  prompt: string;
}

/** Parse `/agy [plan|sandbox] [model] <prompt>` — e.g. `/agy flash fix git conflicts`. */
export function parseAgyCommandArgs(args: string): AgyCommandArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let mode: AgyCommandArgs["mode"] = "accept-edits";

  if (tokens[0] === "plan" || tokens[0] === "sandbox") {
    mode = tokens.shift() as AgyCommandArgs["mode"];
  }

  let model: AgyModel = "flash-medium";
  if (tokens[0] && MODEL_ALIASES[tokens[0].toLowerCase()]) {
    model = MODEL_ALIASES[tokens[0].toLowerCase()];
    tokens.shift();
  }

  return { mode, model, prompt: tokens.join(" ") };
}

/** Register the human-callable `/agy [plan|sandbox] [model] <prompt>` command. */
export function registerAgyCommand(pi: ExtensionAPI): void {
  pi.registerCommand("agy", {
    description:
      "Run agy directly: /agy [plan|sandbox] [model] <prompt> — e.g. /agy flash fix git conflicts",
    getArgumentCompletions: (prefix) => {
      const p = prefix.toLowerCase();
      const items = MODEL_KEYS.filter((k) => k.startsWith(p)).map((k) => ({
        value: k,
        label: k,
      }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/agy requires interactive (TUI) mode", "error");
        return;
      }

      const parsed = parseAgyCommandArgs(args);
      if (!parsed.prompt) {
        ctx.ui.notify("Usage: /agy [plan|sandbox] [model] <prompt>", "warning");
        return;
      }

      const cwd = ctx.cwd;
      ctx.ui.notify(
        `agy: ${parsed.mode} · ${parsed.model} · ${parsed.prompt.slice(0, 60)}${parsed.prompt.length > 60 ? "…" : ""}`,
        "info",
      );

      const progress: string[] = [];
      try {
        const run = await withDirLock(cwd, async () => {
          await runPreflight(cwd);
          const result = await spawnAgyStream(
            {
              prompt: parsed.prompt,
              model: parsed.model,
              mode: parsed.mode,
              dir: cwd,
              timeout_ms: 300_000,
              stream: true,
            },
            new AbortController().signal,
            (msg) => progress.push(msg),
          );
          if (result.conversation_id) {
            await saveSession(cwd, result.conversation_id, parsed.model);
          }
          return result;
        });

        let body = run.response || "(empty response)";
        if (parsed.mode === "accept-edits") {
          const diff = await summarizeGitDiff(cwd);
          if (diff) body += `\n\n${diff}`;
        }
        if (run.conversation_id) {
          body += `\n\nconversation: ${run.conversation_id}`;
        }

        await showAgyResultPanel(ctx, parsed, body, progress, false);
        ctx.ui.notify("agy: done", "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await showAgyResultPanel(ctx, parsed, `agy failed:\n${msg}`, progress, true);
        ctx.ui.notify("agy: failed", "error");
      }
    },
  });
}

async function showAgyResultPanel(
  ctx: ExtensionCommandContext,
  parsed: AgyCommandArgs,
  body: string,
  progress: string[],
  isError: boolean,
): Promise<void> {
  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    let scrollTop = 0;
    let cachedLines: string[] | undefined;
    let totalLines = 0;

    const refresh = () => {
      cachedLines = undefined;
      tui.requestRender();
    };

    const render = (width: number): string[] => {
      if (cachedLines) return cachedLines;
      const renderWidth = Math.max(1, width);

      const title = `agy · ${parsed.mode} · ${parsed.model}`;
      const progressSuffix = progress.length > 0 ? ` · ${progress.length} steps` : "";
      const lines: string[] = [];

      lines.push(theme.fg("accent", `─ ${title}${progressSuffix} ─`));
      if (progress.length > 0) {
        const tail = progress.slice(-4).join("  ");
        lines.push(theme.fg("dim", wrapTextWithAnsi(`  ${tail}`, renderWidth - 2).join("\n")));
      }
      lines.push("");

      const wrapped = wrapTextWithAnsi(body, renderWidth - 4);
      totalLines = wrapped.length;
      const viewport = PANEL_VIEWPORT;
      for (const line of wrapped.slice(scrollTop, scrollTop + viewport)) {
        lines.push(theme.fg(isError ? "warning" : "text", `  ${line}`));
      }

      const end = Math.min(scrollTop + viewport, totalLines);
      const scrollInfo =
        totalLines > viewport ? ` · ${scrollTop + 1}-${end}/${totalLines}` : "";
      lines.push("");
      lines.push(theme.fg("dim", `─ ↑↓ scroll · Esc/Enter close${scrollInfo} ─`));

      cachedLines = lines;
      return lines;
    };

    const handleInput = (data: string) => {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
        done();
        return;
      }
      if (matchesKey(data, Key.up)) {
        if (scrollTop > 0) {
          scrollTop -= 1;
          refresh();
        }
        return;
      }
      if (matchesKey(data, Key.down)) {
        if (scrollTop < Math.max(0, totalLines - PANEL_VIEWPORT)) {
          scrollTop += 1;
          refresh();
        }
      }
    };

    return { render, invalidate: refresh, handleInput };
  });
}
