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

const SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and the user's goal for a new thread, generate a focused prompt that:

1. Summarizes relevant context from the conversation (decisions made, approaches taken, key findings)
2. Lists any relevant files that were discussed or modified
3. Clearly states the next task based on the user's goal
4. Is self-contained - the new thread should be able to proceed without the old conversation

Format your response as a prompt the user can send to start the new thread. Be concise but include all necessary context. Do not include any preamble like "Here's the prompt" - just output the prompt itself.

Example output format:
## Context
We've been working on X. Key decisions:
- Decision 1
- Decision 2

Files involved:
- path/to/file1.ts
- path/to/file2.ts

## Task
[Clear description of what to do next based on user's goal]`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") {
    return entry.message;
  }
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

interface RestartFlags {
  edit: boolean;
  noCompact: boolean;
  preview: boolean;
  compactOnly: boolean;
  model?: string;
  goal: string;
}

function parseRestartArgs(raw: string): RestartFlags {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const flags: RestartFlags = {
    edit: false,
    noCompact: false,
    preview: false,
    compactOnly: false,
    goal: "",
  };

  const positional: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "--edit") {
      flags.edit = true;
    } else if (part === "--no-compact") {
      flags.noCompact = true;
    } else if (part === "--preview") {
      flags.preview = true;
    } else if (part === "--compact-only") {
      flags.compactOnly = true;
    } else if (part === "--model") {
      if (i + 1 >= parts.length) {
        throw new Error("--model requires a value (e.g. --model anthropic/claude-sonnet-4)");
      }
      flags.model = parts[++i];
    } else if (part.startsWith("--")) {
      throw new Error(`Unknown flag: ${part}`);
    } else {
      positional.push(part);
    }
  }

  flags.goal = positional.join(" ");
  return flags;
}

function resolveHandoffModel(ctx: ExtensionCommandContext, flag?: string) {
  if (!flag) {
    return ctx.model;
  }

  const slashIdx = flag.indexOf("/");
  if (slashIdx > 0) {
    const provider = flag.slice(0, slashIdx);
    const id = flag.slice(slashIdx + 1);
    const found = ctx.modelRegistry.find(provider, id);
    if (found) return found;
  }

  // Fallback: search available models by id
  const available = ctx.modelRegistry.getAvailable();
  const match = available.find((m) => m.id === flag);
  if (match) return match;

  return undefined;
}

interface HandoffResult {
  prompt: string;
  messageCount: number;
  conversationChars: number;
}

async function generateHandoffPrompt(
  ctx: ExtensionCommandContext,
  model: NonNullable<ExtensionCommandContext["model"]>,
  goal: string,
): Promise<HandoffResult | null> {
  const entries = ctx.sessionManager.buildContextEntries();
  const messages = entries
    .map(entryToMessage)
    .filter((m): m is AgentMessage => m !== undefined);

  if (messages.length === 0) {
    return null;
  }

  const llmMessages = convertToLlm(messages);
  const conversationText = serializeConversation(llmMessages);

  let generationError: Error | null = null;
  const prompt = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, "Generating handoff prompt...");
    loader.onAbort = () => done(null);

    const doGenerate = async () => {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) {
        throw new Error(auth.ok ? `No API key for ${model.provider}` : auth.error);
      }

      const goalText = goal
        ? `## User's Goal for New Thread\n\n${goal}`
        : "## Task\n\nContinue from where we left off, preserving all context.";

      const userMessage: Message = {
        role: "user",
        content: [
          {
            type: "text",
            text: `## Conversation History\n\n${conversationText}\n\n${goalText}`,
          },
        ],
        timestamp: Date.now(),
      };

      const response = await complete(
        model,
        { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
        { apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal: loader.signal },
      );

      if (response.stopReason === "aborted") {
        return null;
      }

      return response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
    };

    doGenerate()
      .then(done)
      .catch((err) => {
        generationError = err instanceof Error ? err : new Error(String(err));
        console.error("restart: handoff generation failed:", generationError);
        done(null);
      });

    return loader;
  });

  if (prompt === null) {
    if (generationError) {
      throw generationError;
    }
    return null;
  }

  return {
    prompt,
    messageCount: messages.length,
    conversationChars: conversationText.length,
  };
}

async function compactSession(ctx: ExtensionCommandContext): Promise<boolean> {
  await ctx.ui.notify("Compacting session...", "info");
  try {
    await new Promise<void>((resolve, reject) => {
      ctx.compact({
        onComplete: () => resolve(),
        onError: (error) => reject(error),
      });
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.ui.notify(`Compaction failed: ${message}`, "error");
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("restart", {
    description:
      "Compact, generate handoff prompt, and start fresh. Flags: --edit, --preview, --no-compact, --model, --compact-only",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        await ctx.ui.notify("restart requires interactive mode", "error");
        return;
      }

      let flags: RestartFlags;
      try {
        flags = parseRestartArgs(args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.ui.notify(message, "error");
        return;
      }

      // Just compact and return
      if (flags.compactOnly) {
        if (!ctx.isIdle()) {
          ctx.abort();
          await ctx.waitForIdle();
          await ctx.ui.notify("Agent stopped", "info");
        }
        await compactSession(ctx);
        return;
      }

      // Resolve the model we'll use for handoff generation
      const handoffModel = resolveHandoffModel(ctx, flags.model);
      if (!handoffModel) {
        if (flags.model) {
          await ctx.ui.notify(`Model not found: ${flags.model}`, "error");
        } else {
          await ctx.ui.notify("No model selected", "error");
        }
        return;
      }

      if (flags.model && handoffModel !== ctx.model) {
        await ctx.ui.notify(
          `Using ${handoffModel.provider}/${handoffModel.id} for handoff generation`,
          "info",
        );
      }

      // Abort if agent is active
      if (!ctx.isIdle()) {
        ctx.abort();
        await ctx.waitForIdle();
        await ctx.ui.notify("Agent stopped", "info");
      }

      // Compact unless requested not to
      if (!flags.noCompact) {
        const ok = await compactSession(ctx);
        if (!ok) return;
      }

      // Generate handoff prompt
      let result: HandoffResult | null;
      try {
        result = await generateHandoffPrompt(ctx, handoffModel, flags.goal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.ui.notify(`Handoff generation failed: ${message}`, "error");
        return;
      }
      if (result === null) {
        await ctx.ui.notify("No conversation context to transfer", "error");
        return;
      }

      await ctx.ui.notify(
        `Handoff prompt generated from ${result.messageCount} messages (${(result.conversationChars / 1000).toFixed(1)}k chars)`,
        "info",
      );

      // Preview/edit mode
      let finalPrompt = result.prompt;
      if (flags.edit || flags.preview) {
        const title = flags.preview
          ? "Preview handoff prompt — edit and submit to restart"
          : "Edit handoff prompt";
        const edited = await ctx.ui.editor(title, finalPrompt);
        if (edited === undefined) {
          await ctx.ui.notify("Cancelled", "info");
          return;
        }
        finalPrompt = edited;
      }

      // Preview mode asks for confirmation before switching sessions
      if (flags.preview) {
        const proceed = await ctx.ui.confirm(
          "Start new session?",
          "Use this handoff prompt to start a fresh session?",
        );
        if (!proceed) {
          await ctx.ui.notify("Cancelled", "info");
          return;
        }
      }

      // Create new session
      await ctx.ui.notify("Starting fresh session...", "info");
      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
        withSession: async (replacementCtx) => {
          if (flags.edit) {
            // User already reviewed/edited; just set it in the editor for manual submit
            replacementCtx.ui.setEditorText(finalPrompt);
            replacementCtx.ui.notify("Restart ready. Submit when ready.", "info");
          } else {
            // Auto-send the generated/reviewed prompt
            await replacementCtx.sendUserMessage(finalPrompt);
          }
        },
      });

      if (newSessionResult.cancelled) {
        await ctx.ui.notify("New session cancelled", "info");
      }
    },
  });

  pi.registerShortcut("ctrl+shift+r", {
    description: "Prepare the /restart command",
    handler: async (ctx) => {
      // sendUserMessage() intentionally bypasses slash-command dispatch, so
      // sending "/restart" here would ask the model to restart itself.
      ctx.ui.setEditorText("/restart");
      ctx.ui.notify("Restart command ready. Press Enter to run it.", "info");
    },
  });
}
