/**
 * Restart v2 — lightweight session handoff with auto context guard.
 *
 * Two triggers:
 * 1. /restart [--edit] [--preview] [--model ...] [--compact] [goal...]
 * 2. Auto context guard at 80% (turn_end check)
 *
 * Handoff context is condensed: compaction summaries + user messages +
 * assistant text without thinking + write/edit results + last messages fully.
 * No compaction for the restart path (old session stays intact on disk).
 */

import { complete, type Message } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  BorderedLoader,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and a goal for a new thread, generate a focused handoff prompt that:

1. Summarizes relevant context (decisions, approaches, key findings)
2. Lists relevant files that were discussed or modified
3. States the next task clearly
4. Is self-contained — the new thread must proceed without the old conversation

Format:
## Context
[Key decisions, current state]

## Files
[Paths that matter]

## Task
[What to do next]

No preamble. Only the prompt.`;

/* ───── Context guard constants ───── */

const CONTEXT_THRESHOLD_PERCENT = 80;
const AFK_TIMEOUT_MS = 60_000;
/* ───── Helpers ───── */

interface RestartFlags {
  edit: boolean;
  preview: boolean;
  compact: boolean;
  compactOnly: boolean;
  model?: string;
  goal: string;
}

function parseRestartArgs(raw: string): RestartFlags {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const flags: RestartFlags = { edit: false, preview: false, compact: false, compactOnly: false, goal: "" };
  const positional: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "--edit") { flags.edit = true; continue; }
    if (p === "--preview") { flags.preview = true; continue; }
    if (p === "--compact") { flags.compact = true; continue; }
    if (p === "--compact-only") { flags.compactOnly = true; continue; }
    if (p === "--model") {
      if (++i >= parts.length) throw new Error("--model requires a value");
      flags.model = parts[i];
      continue;
    }
    if (p.startsWith("--")) throw new Error(`Unknown flag: ${p}`);
    positional.push(p);
  }
  flags.goal = positional.join(" ");
  return flags;
}

function resolveHandoffModel(ctx: ExtensionCommandContext, flag?: string) {
  if (!flag) return ctx.model;
  const si = flag.indexOf("/");
  if (si > 0) {
    const found = ctx.modelRegistry.find(flag.slice(0, si), flag.slice(si + 1));
    if (found) return found;
  }
  return ctx.modelRegistry.getAvailable().find((m) => m.id === flag);
}

interface HandoffResult {
  prompt: string;
  messageCount: number;
  contextChars: number;
}

/**
 * Prepare condensed handoff context.
 *
 * Keeps: compaction summaries, user messages (full), assistant text (no thinking),
 * write/edit tool results (truncated), error bash results (truncated).
 * Drops: thinking blocks, successful bash stdout, read/grep/find/ls results.
 */
function prepareHandoffContext(entries: SessionEntry[]): string {
  const compactions: string[] = [];
  const messages: Message[] = [];

  for (const entry of entries) {
    if (entry.type === "compaction") {
      compactions.push(entry.summary);
      continue;
    }
    if (entry.type !== "message") continue;

    const msg = entry.message;
    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: msg.content.filter((c: any) => c.type === "text"),
        timestamp: msg.timestamp,
      });
    } else if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: msg.content.filter((c: any) => c.type !== "thinking"),
        timestamp: msg.timestamp,
      });
    } else if (msg.role === "toolResult") {
      const toolName = String(msg.toolName || "").toLowerCase();
      // Keep write/edit results (truncated) — they show what changed
      if (toolName === "write" || toolName === "edit") {
        messages.push({
          role: "toolResult",
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          content: msg.content.map((c: any) =>
            c.type === "text" ? { ...c, text: String(c.text || "").slice(0, 500) } : c
          ),
          timestamp: msg.timestamp,
          isError: msg.isError,
        });
      }
      // Keep error bash results (truncated) — they show what went wrong
      if (toolName === "bash" && msg.isError) {
        messages.push({
          role: "toolResult",
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          content: msg.content.map((c: any) =>
            c.type === "text" ? { ...c, text: String(c.text || "").slice(0, 300) } : c
          ),
          timestamp: msg.timestamp,
          isError: true,
        });
      }
      // Everything else (successful bash, read, grep, find, ls) is dropped
    }
  }

  const parts: string[] = [];
  if (compactions.length) {
    parts.push("[Compacted context: " + compactions.join(" | ") + "]");
  }
  for (const msg of messages) {
    if (msg.role === "user") {
      const text = msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
      if (text.trim()) parts.push("[User] " + text.trim());
    } else if (msg.role === "assistant") {
      const text = msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
      const tools = msg.content.filter((c: any) => c.type === "toolCall").map((c: any) => c.name || "?");
      const line = text.trim() + (tools.length ? "\n  [tools: " + tools.join(", ") + "]" : "");
      if (line.trim()) parts.push("[Assistant] " + line.trim());
    } else if (msg.role === "toolResult") {
      const text = msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
      if (text.trim()) {
        const label = msg.isError ? "[Error]" : "[" + (msg.toolName || "tool") + " result]";
        parts.push(label + " " + text.trim());
      }
    }
  }

  return parts.join("\n\n");
}

async function generateHandoffPrompt(
  ctx: ExtensionCommandContext,
  model: NonNullable<ExtensionCommandContext["model"]>,
  goal: string,
): Promise<HandoffResult | null> {
  const entries = ctx.sessionManager.buildContextEntries();
  const hasContent = entries.some(e => e.type === "message" || e.type === "compaction");
  if (!hasContent) return null;

  // Prepare condensed context
  const condensedText = prepareHandoffContext(entries);

  let generationError: Error | null = null;
  const prompt = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, "Generating handoff prompt...");
    loader.onAbort = () => done(null);

    const doGenerate = async () => {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? `No API key for ${model.provider}` : auth.error);

      const goalText = goal
        ? `## User's Goal for New Thread\n\n${goal}`
        : "## Task\n\nContinue from where we left off, preserving all context.";

      const userMessage: Message = {
        role: "user",
        content: [{ type: "text", text: `## Conversation (condensed)\n\n${condensedText}\n\n${goalText}` }],
        timestamp: Date.now(),
      };

      const response = await complete(
        model,
        { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
        { apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal: loader.signal },
      );
      if (response.stopReason === "aborted") return null;
      return response.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    };

    doGenerate().then(done).catch((err) => {
      generationError = err instanceof Error ? err : new Error(String(err));
      done(null);
    });
    return loader;
  });

  const messageCount = entries.filter(e => e.type === "message" || e.type === "compaction").length;
  if (prompt === null && generationError) throw generationError;
  return prompt ? { prompt, messageCount, contextChars: condensedText.length } : null;
}

async function compactSession(ctx: ExtensionCommandContext): Promise<boolean> {
  await ctx.ui.notify("Compacting session...", "info");
  try {
    await new Promise<void>((resolve, reject) => {
      ctx.compact({ onComplete: () => resolve(), onError: (error) => reject(error) });
    });
    return true;
  } catch (error) {
    await ctx.ui.notify(`Compaction failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    return false;
  }
}

/* ───── Extension ───── */

export default function (pi: ExtensionAPI) {
  let lastSuppressedPct: number | null = null;
  const RE_PROMPT_INTERVAL = 5; // re-prompt if usage has climbed this many % since last dismissal

  /* ── Auto context guard ── */

  pi.on("session_start", () => { lastSuppressedPct = null; });

  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const usage = ctx.getContextUsage?.();
    if (!usage || usage.percent === null || usage.percent < CONTEXT_THRESHOLD_PERCENT) return;

    const pct = Math.round(usage.percent);
    // Don't re-prompt unless usage has climbed meaningfully since last dismissal
    if (lastSuppressedPct !== null && pct < lastSuppressedPct + RE_PROMPT_INTERVAL) return;
    lastSuppressedPct = pct;
    const sessionBefore = ctx.sessionManager.getSessionId();
    const timeoutController = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => { didTimeout = true; timeoutController.abort(); }, AFK_TIMEOUT_MS);

    const choice = await ctx.ui.select(
      `Context at ${pct}% — handoff to a new session?`,
      ["Yes, handoff", "Not now"],
      { signal: timeoutController.signal },
    );
    clearTimeout(timeoutId);

    // Session changed while waiting — bail
    if (ctx.sessionManager.getSessionId() !== sessionBefore) return;

    if (choice === "Not now") {
      ctx.ui.notify(`Restart guard muted until ${pct + RE_PROMPT_INTERVAL}%`, "info");
      return;
    }
    if (!choice && !didTimeout) {
      // User dismissed without picking — treat as "not now"
      ctx.ui.notify(`Restart guard muted until ${pct + RE_PROMPT_INTERVAL}%`, "info");
      return;
    }

    // Handoff — tell the model to write a prompt and call the handoff tool
    ctx.ui.notify("Context is full — starting handoff...", "warning");
    pi.sendMessage(
      {
        customType: "restart:auto-handoff",
        content:
          `Context is at ${pct}%. Handoff to a new session now.\n\n` +
          `Write a complete handoff prompt that captures:\n` +
          `- What we're working on and key decisions\n` +
          `- Files involved and current state\n` +
          `- What to do next\n\n` +
          `Then call the \`handoff\` tool with your prompt. This is the only briefing the next session gets — be thorough.`,
        display: false,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  });

  /* ── handoff tool ── */

  pi.registerTool({
    name: "handoff",
    label: "Handoff",
    description:
      "Transfer context to a new focused session. " +
      "Write a complete self-contained prompt with context, decisions, files, and the task. " +
      "This is the only briefing the next agent gets.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Complete handoff prompt for the next session." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) return { content: [{ type: "text", text: "Handoff requires interactive mode." }] };
      const currentSessionFile = ctx.sessionManager.getSessionFile();
      // Defer so tool_result is recorded in the current session first
      queueMicrotask(async () => {
        try {
          const result = await ctx.newSession({ parentSession: currentSessionFile });
          if (!result.cancelled && "ctx" in result && (result as any).ctx?.sendUserMessage) {
            await (result as any).ctx.sendUserMessage(params.prompt);
          }
        } catch (error) {
          console.error("handoff: session switch failed:", error);
        }
      });
      return { content: [{ type: "text", text: "Handoff started." }] };
    },
  });

  /* ── /restart command ── */

  pi.registerCommand("restart", {
    description:
      "Generate handoff prompt and start fresh. Flags: --edit, --preview, --model, --compact, --compact-only",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") { await ctx.ui.notify("restart requires interactive mode", "error"); return; }

      let flags: RestartFlags;
      try { flags = parseRestartArgs(args); }
      catch (error) { await ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); return; }

      // compact-only: just compact and return
      if (flags.compactOnly) {
        if (!ctx.isIdle()) { ctx.abort(); await ctx.waitForIdle(); await ctx.ui.notify("Agent stopped", "info"); }
        await compactSession(ctx);
        return;
      }

      // Resolve handoff model
      const handoffModel = resolveHandoffModel(ctx, flags.model);
      if (!handoffModel) { await ctx.ui.notify(flags.model ? `Model not found: ${flags.model}` : "No model selected", "error"); return; }

      if (!ctx.isIdle()) { ctx.abort(); await ctx.waitForIdle(); await ctx.ui.notify("Agent stopped", "info"); }

      // Compact only if explicitly requested (--compact)
      if (flags.compact) {
        const ok = await compactSession(ctx);
        if (!ok) return;
      }

      // Generate handoff
      let result: HandoffResult | null;
      try { result = await generateHandoffPrompt(ctx, handoffModel, flags.goal); }
      catch (error) { await ctx.ui.notify(`Handoff generation failed: ${error instanceof Error ? error.message : String(error)}`, "error"); return; }
      if (!result) { await ctx.ui.notify("No conversation to transfer", "error"); return; }

      await ctx.ui.notify(`Handoff: ${result.messageCount} msgs, ${(result.contextChars / 1000).toFixed(1)}k chars`, "info");

      let finalPrompt = result.prompt;
      if (flags.edit || flags.preview) {
        const edited = await ctx.ui.editor(
          flags.preview ? "Preview handoff prompt — edit to submit" : "Edit handoff prompt",
          finalPrompt,
        );
        if (edited === undefined) { await ctx.ui.notify("Cancelled", "info"); return; }
        finalPrompt = edited;
      }
      if (flags.preview) {
        const proceed = await ctx.ui.confirm("Start new session?", "Use this prompt?");
        if (!proceed) { await ctx.ui.notify("Cancelled", "info"); return; }
      }

      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
        withSession: async (replacementCtx) => {
          if (flags.edit) {
            replacementCtx.ui.setEditorText(finalPrompt);
            replacementCtx.ui.notify("Restart ready. Submit when ready.", "info");
          } else {
            await replacementCtx.sendUserMessage(finalPrompt);
          }
        },
      });
      if (newSessionResult.cancelled) await ctx.ui.notify("New session cancelled", "info");
    },
  });

  pi.registerShortcut("ctrl+shift+r", {
    description: "Prepare the /restart command",
    handler: async (ctx) => {
      ctx.ui.setEditorText("/restart");
      ctx.ui.notify("Restart ready. Press Enter.", "info");
    },
  });
}
