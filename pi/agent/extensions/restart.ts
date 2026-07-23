/**
 * Session handoff with a context guard.
 *
 * /restart generates a handoff prompt from the current branch and starts a
 * fresh session. The context guard only prepares /restart in the editor:
 * session replacement is a command-only API in Pi and cannot safely be called
 * from turn_end or a tool callback.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { complete, type Message } from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  BorderedLoader,
  convertToLlm,
  serializeConversation,
} from "@earendil-works/pi-coding-agent";

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

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") return entry.message;
  if (entry.type === "compaction") {
    return {
      role: "compactionSummary",
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  return undefined;
}

/** Return the current branch without replaying entries hidden by compaction. */
function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
  let compactionIndex = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      compactionIndex = i;
      break;
    }
  }

  if (compactionIndex < 0) {
    return branch.map(entryToMessage).filter((message): message is AgentMessage => message !== undefined);
  }

  const compaction = branch[compactionIndex];
  const firstKeptIndex =
    compaction.type === "compaction"
      ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId)
      : -1;
  const compactedBranch = [
    compaction,
    ...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
    ...branch.slice(compactionIndex + 1),
  ];
  return compactedBranch
    .map(entryToMessage)
    .filter((message): message is AgentMessage => message !== undefined);
}

async function generateHandoffPrompt(
  ctx: ExtensionCommandContext,
  model: NonNullable<ExtensionCommandContext["model"]>,
  goal: string,
): Promise<HandoffResult | null> {
  const messages = getHandoffMessages(ctx.sessionManager.getBranch());
  if (messages.length === 0) return null;

  const conversationText = serializeConversation(convertToLlm(messages));

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
        content: [{ type: "text", text: `## Conversation History\n\n${conversationText}\n\n${goalText}` }],
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

  if (prompt === null && generationError) throw generationError;
  return prompt ? { prompt, messageCount: messages.length, contextChars: conversationText.length } : null;
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
  const lastPromptedPct = new Map<string, number>();
  let guardDialogOpen = false;
  const RE_PROMPT_INTERVAL = 5;

  /* ── Context guard ── */

  pi.on("session_shutdown", (_event, ctx) => {
    lastPromptedPct.delete(ctx.sessionManager.getSessionId());
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (ctx.mode !== "tui" || guardDialogOpen) return;

    const usage = ctx.getContextUsage?.();
    if (!usage || usage.percent === null || usage.percent < CONTEXT_THRESHOLD_PERCENT) return;

    const sessionBefore = ctx.sessionManager.getSessionId();
    const pct = Math.round(usage.percent);
    const previousPct = lastPromptedPct.get(sessionBefore);
    if (previousPct !== undefined && pct < previousPct + RE_PROMPT_INTERVAL) return;
    lastPromptedPct.set(sessionBefore, pct);

    guardDialogOpen = true;
    const timeoutController = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, AFK_TIMEOUT_MS);
    let choice: string | undefined;
    try {
      choice = await ctx.ui.select(
        `Context at ${pct}% — prepare a handoff?`,
        ["Yes, prepare restart", "Not now"],
        { signal: timeoutController.signal },
      );
    } catch {
      // Dialog dismissal (including timeout) is equivalent to “Not now”.
      choice = undefined;
    } finally {
      clearTimeout(timeoutId);
      guardDialogOpen = false;
    }

    // Session replacement or reload may have happened while the dialog was open.
    if (ctx.sessionManager.getSessionId() !== sessionBefore) return;

    if (choice !== "Yes, prepare restart" && !didTimeout) {
      ctx.ui.notify(`Restart guard muted until ${pct + RE_PROMPT_INTERVAL}%`, "info");
      return;
    }

    // newSession() is intentionally unavailable in event and tool contexts.
    // Put the real command in the editor so the user can submit it safely,
    // without overwriting a draft the user may already be composing.
    if (!ctx.ui.getEditorText().trim()) {
      ctx.ui.setEditorText("/restart");
      ctx.ui.notify("Restart ready. Press Enter to generate the handoff.", "warning");
    } else {
      ctx.ui.notify("Context is high. Run /restart when your current draft is ready.", "warning");
    }
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
