import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { spawnAgyStream, type AgyModel } from "./lib/cli.js";
import { withDirLock } from "./lib/lock.js";
import { summarizeGitDiff } from "./lib/postflight.js";
import { runPreflight } from "./lib/preflight.js";
import { saveSession } from "./lib/sessions.js";
import type { AgyRunResult } from "./lib/stream.js";

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

const PANEL_VIEWPORT = 30;
const PROGRESS_KEEP = 200;

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

/** Register the human-callable `/agy [plan|sandbox] [model] <prompt>` command. */
export function registerAgyCommand(pi: ExtensionAPI): void {
  pi.registerCommand("agy", {
    description:
      "Run agy: /agy [plan|sandbox] [model] <prompt>. With missing parts, prompts interactively.",
    getArgumentCompletions: (prefix) => {
      const tokens = prefix.trim().split(/\s+/).filter(Boolean);
      const p = prefix.toLowerCase();

      // After a mode token, suggest models. Otherwise suggest modes first.
      if (tokens.length === 1 && (tokens[0] === "plan" || tokens[0] === "sandbox")) {
        return MODEL_KEYS.filter((k) => k.startsWith("")).map((k) => ({
          value: k,
          label: k,
        }));
      }
      if (tokens.length <= 1) {
        const modes = ["plan", "sandbox"].filter((m) => m.startsWith(tokens[0] ?? ""));
        const models = MODEL_KEYS.filter((k) => k.startsWith(p));
        const items = [...modes.map((m) => ({ value: m, label: m })), ...models.map((m) => ({ value: m, label: m }))];
        return items.length > 0 ? items : null;
      }
      return null;
    },
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/agy requires interactive (TUI) mode", "error");
        return;
      }

      // 1. Fill gaps interactively (mode → model → prompt), or accept fast path when fully specified.
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

      // 3. Execute with a live, cancellable progress panel.
      const run = await runAgyLive(ctx, { mode, model, prompt }, cwd);
      if (!run) {
        ctx.ui.notify("agy: cancelled", "info");
        return;
      }

      // 4. Postflight: diff summary for write mode.
      let body = run.response || "(empty response)";
      if (mode === "accept-edits") {
        const diff = await summarizeGitDiff(cwd);
        if (diff) body += `\n\n${diff}`;
      }
      if (run.conversation_id) body += `\n\nconversation: ${run.conversation_id}`;
      if (run.usage?.total_tokens != null) {
        body += `\nusage: ${run.usage.total_tokens} tokens`;
      }

      await showAgyResultPanel(ctx, { mode, model, prompt }, body);
      if (run.conversation_id) await saveSession(cwd, run.conversation_id, model);
      ctx.ui.notify("agy: done", "info");
    },
  });
}

function optionKey(option: string): string {
  return option.split(" — ")[0] ?? option;
}

interface PanelLayout {
  title: string;
  subtitle?: string;
  entries: string[];
  footer: string;
  viewport: number;
  scrollTop: number;
  width: number;
  colorize: (text: string) => string;
}

/**
 * Render a bordered scrollable panel. Every emitted line is truncated to the
 * terminal width — custom TUI components that exceed the width crash pi.
 * Returns the rendered lines and the total wrapped content height.
 */
export function layoutPanel(layout: PanelLayout): { lines: string[]; totalLines: number } {
  const renderWidth = Math.max(1, layout.width);
  const lines: string[] = [];
  const push = (line: string) => lines.push(truncateToWidth(line, renderWidth));

  push(layout.colorize(`─ ${layout.title} ─`));
  if (layout.subtitle) {
    for (const sub of wrapTextWithAnsi(layout.subtitle, renderWidth - 4)) {
      push(layout.colorize(`  ${sub}`));
    }
  }
  push("");

  const wrapped: string[] = [];
  for (const entry of layout.entries) {
    wrapped.push(...wrapTextWithAnsi(entry, renderWidth - 4));
  }
  const totalLines = wrapped.length;
  for (const line of wrapped.slice(layout.scrollTop, layout.scrollTop + layout.viewport)) {
    push(layout.colorize(`  ${line}`));
  }

  push("");
  push(layout.colorize(layout.footer));
  return { lines, totalLines };
}

/** Run agy inside a live panel that streams progress and cancels on Esc. */
async function runAgyLive(
  ctx: ExtensionCommandContext,
  parsed: { mode: "plan" | "accept-edits" | "sandbox"; model: AgyModel; prompt: string },
  cwd: string,
): Promise<AgyRunResult | null> {
  return ctx.ui.custom<AgyRunResult | null>((tui, theme, _kb, done) => {
    const ac = new AbortController();
    const buffer: string[] = [];
    let cachedLines: string[] | undefined;
    let scrollTop = 0;
    let totalLines = 0;
    let finished = false;

    const refresh = () => {
      cachedLines = undefined;
      tui.requestRender();
    };

    const onProgress = (msg: string) => {
      buffer.push(msg);
      if (buffer.length > PROGRESS_KEEP) buffer.splice(0, buffer.length - PROGRESS_KEEP);
      refresh();
    };

    const start = async () => {
      try {
        const result = await withDirLock(cwd, async () => {
          await runPreflight(cwd, ac.signal);
          return spawnAgyStream(
            {
              prompt: parsed.prompt,
              model: parsed.model,
              mode: parsed.mode,
              dir: cwd,
              timeout_ms: 300_000,
              stream: true,
            },
            ac.signal,
            onProgress,
          );
        });
        finished = true;
        done(result);
      } catch (err) {
        finished = true;
        if (ac.signal.aborted) {
          done(null);
        } else {
          buffer.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
          refresh();
          // Small delay so the user can read the error before the panel closes.
          setTimeout(() => done(null), 2500);
        }
      }
    };

    const render = (width: number): string[] => {
      if (cachedLines) return cachedLines;
      const renderWidth = Math.max(1, width);
      const title = `agy · ${parsed.mode} · ${parsed.model}${finished ? " · finished" : " · running"}`;
      const entries =
        buffer.length === 0 && !finished
          ? ["(waiting for agy…)"]
          : buffer;
      const end = Math.min(scrollTop + PANEL_VIEWPORT, totalLines);
      const scrollInfo = totalLines > PANEL_VIEWPORT ? ` · ${scrollTop + 1}-${end}/${totalLines}` : "";
      const footer = `↑↓ scroll · Esc ${finished ? "close" : "cancel"}${scrollInfo}`;

      const laid = layoutPanel({
        title,
        subtitle: parsed.prompt,
        entries,
        footer,
        viewport: PANEL_VIEWPORT,
        scrollTop,
        width: renderWidth,
        colorize: (t) => theme.fg("dim", t),
      });
      totalLines = laid.totalLines;
      cachedLines = laid.lines;
      return laid.lines;
    };

    const handleInput = (data: string) => {
      if (matchesKey(data, Key.escape)) {
        if (finished) done(null);
        else ac.abort();
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

    void start();
    return { render, invalidate: refresh, handleInput };
  });
}

/** Scrollable result panel with response, diff summary, conversation id. */
async function showAgyResultPanel(
  ctx: ExtensionCommandContext,
  parsed: { mode: string; model: AgyModel; prompt: string },
  body: string,
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
      const end = Math.min(scrollTop + PANEL_VIEWPORT, totalLines);
      const scrollInfo = totalLines > PANEL_VIEWPORT ? ` · ${scrollTop + 1}-${end}/${totalLines}` : "";

      const laid = layoutPanel({
        title: `agy result · ${parsed.mode} · ${parsed.model}`,
        subtitle: parsed.prompt,
        entries: [body],
        footer: `↑↓ scroll · Esc/Enter close${scrollInfo}`,
        viewport: PANEL_VIEWPORT,
        scrollTop,
        width: renderWidth,
        colorize: (t) => theme.fg("text", t),
      });
      totalLines = laid.totalLines;
      cachedLines = laid.lines;
      return laid.lines;
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
