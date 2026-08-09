/**
 * /restart — proactive context guard + handoff to a fresh session.
 * Guard warns at 80%; /restart compresses conversation into a prompt
 * and sends it straight to a fresh session (no editor review).
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { uuidv7 } from "@earendil-works/pi-ai";
import { complete, type Message } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  BorderedLoader,
  buildSessionContext,
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

const THRESHOLD_PCT = 80;
const AFK_MS = 60_000;
const RE_PROMPT_GAP = 5;

export default function (pi: ExtensionAPI) {
  const lastPct = new Map<string, number>();
  const guardOpen = new Set<string>();

  /* ── Context guard ── */
  pi.on("session_shutdown", (_e, ctx) => {
    const sid = ctx.sessionManager.getSessionId();
    lastPct.delete(sid);
    guardOpen.delete(sid);
  });

  pi.on("turn_end", async (_e, ctx) => {
    if (ctx.mode !== "tui") return;
    const usage = ctx.getContextUsage?.();
    if (!usage || usage.percent === null || usage.percent < THRESHOLD_PCT) return;

    const sid = ctx.sessionManager.getSessionId();
    if (guardOpen.has(sid)) return;
    const pct = Math.round(usage.percent);
    const prev = lastPct.get(sid);
    if (prev !== undefined && pct < prev + RE_PROMPT_GAP) return;
    lastPct.set(sid, pct);

    guardOpen.add(sid);
    let choice: string | undefined;
    try {
      choice = await ctx.ui.select(
        `Context at ${pct}% — prepare a handoff?`,
        ["Yes, prepare /restart", "Not now"],
        { timeout: AFK_MS },
      );
    } catch { /* timeout/dismissal */ } finally {
      guardOpen.delete(sid);
    }
    if (ctx.sessionManager.getSessionId() !== sid) return;
    if (choice !== "Yes, prepare /restart") {
      ctx.ui.notify(`Muted until ${pct + RE_PROMPT_GAP}%`, "info");
      return;
    }
    if (!ctx.ui.getEditorText().trim()) {
      ctx.ui.setEditorText("/restart");
      ctx.ui.notify("Restart ready — press Enter.", "warning");
    } else {
      ctx.ui.notify("Context is high. Run /restart when your draft is ready.", "warning");
    }
  });

  /* ── /restart command ── */
  pi.registerCommand("restart", {
    description: "Generate a handoff prompt and start a fresh session",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return ctx.ui.notify("/restart requires interactive mode", "error");
      if (!ctx.model) return ctx.ui.notify("No model selected", "error");
      // Extension commands execute immediately, even during streaming. Do NOT
      // abort here: killing the in-flight turn loses its (uncommitted) content
      // from the handoff. Wait for the current run to settle instead.
      if (!ctx.isIdle()) await ctx.waitForIdle();

      const context = buildSessionContext(ctx.sessionManager.getBranch(), ctx.sessionManager.getLeafId());
      const msgs: AgentMessage[] = context.messages;
      if (!msgs.length) return ctx.ui.notify("No conversation to transfer", "error");

      const conversation = serializeConversation(convertToLlm(msgs));
      const currentFile = ctx.sessionManager.getSessionFile();
      const goal = args.trim() || "Continue from where we left off.";

      const prompt = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, "Generating handoff prompt…");
        loader.onAbort = () => done(null);
        (async () => {
          const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
          if (!auth.ok || !auth.apiKey) { done(null); return; }
          const userMsg: Message = {
            role: "user",
            content: [{ type: "text", text: `## Conversation History\n\n${conversation}\n\n## Goal\n\n${goal}` }],
            timestamp: Date.now(),
          };
          const response = await complete(
            ctx.model!,
            { systemPrompt: SYSTEM_PROMPT, messages: [userMsg] },
            { apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal: loader.signal, cacheRetention: "none", sessionId: uuidv7() },
          );
          if (response.stopReason === "aborted") { done(null); return; }
          done(response.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map(c => c.text).join("\n") || null);
        })().catch(() => done(null));
        return loader;
      });
      if (!prompt) return ctx.ui.notify("Handoff cancelled", "info");
      // Fire immediately — no editor review. Abort during generation (Escape)
      // is the cancellation point; the loader resolves null and we bail above.
      const result = await ctx.newSession({ parentSession: currentFile, withSession: rc => rc.sendUserMessage(prompt) });
      if (result.cancelled) ctx.ui.notify("New session cancelled", "info");
    },
  });

  pi.registerShortcut("ctrl+shift+r", {
    description: "Prepare /restart command",
    handler: (ctx) => {
      ctx.ui.setEditorText("/restart");
      ctx.ui.notify("Restart ready. Press Enter.", "info");
    },
  });
}
