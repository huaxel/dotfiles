import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

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

function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
  let compactionIndex = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      compactionIndex = i;
      break;
    }
  }
  if (compactionIndex < 0) {
    return branch.map(entryToMessage).filter((m) => m !== undefined);
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
  return compactedBranch.map(entryToMessage).filter((m) => m !== undefined);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("restart", {
    description: "Compact, generate handoff prompt, and start fresh",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        await ctx.ui.notify("restart requires interactive mode", "error");
        return;
      }

      if (!ctx.model) {
        await ctx.ui.notify("No model selected", "error");
        return;
      }

      // Parse args
      const trimmed = args.trim();
      const argsParts = trimmed.split(/\s+/);
      const editFlag = argsParts.includes("--edit");
      const goal = argsParts.filter((a) => a !== "--edit").join(" ");

      // 1. Abort if agent is active
      if (!ctx.isIdle()) {
        ctx.abort();
        await ctx.waitForIdle();
        await ctx.ui.notify("Agent stopped", "info");
      }

      // 2. Compact
      await ctx.ui.notify("Compacting session...", "info");
      try {
        await new Promise<void>((resolve, reject) => {
          ctx.compact({
            onComplete: () => resolve(),
            onError: (error) => reject(error),
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.ui.notify(`Compaction failed: ${message}`, "error");
        return;
      }

      // 3. Gather conversation context
      const messages = getHandoffMessages(ctx.sessionManager.getBranch());
      if (messages.length === 0) {
        await ctx.ui.notify("No conversation context to transfer", "error");
        return;
      }

      const llmMessages = convertToLlm(messages);
      const conversationText = serializeConversation(llmMessages);
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      // 4. Generate handoff prompt via LLM
      let generationError: Error | null = null;

      const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, "Generating handoff prompt...");
        loader.onAbort = () => done(null);

        const doGenerate = async () => {
          const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
          if (!auth.ok || !auth.apiKey) {
            throw new Error(auth.ok ? `No API key for ${ctx.model!.provider}` : auth.error);
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
            ctx.model!,
            { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
            { apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
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
            done(null);
          });

        return loader;
      });

      if (result === null) {
        if (generationError) {
          await ctx.ui.notify(`Handoff generation failed: ${generationError.message}`, "error");
        } else {
          await ctx.ui.notify("Cancelled", "info");
        }
        return;
      }

      // 5. Edit or auto-send
      let finalPrompt = result;
      if (editFlag) {
        const edited = await ctx.ui.editor("Edit handoff prompt", result);
        if (edited === undefined) {
          await ctx.ui.notify("Cancelled", "info");
          return;
        }
        finalPrompt = edited;
      }

      // 6. Create new session
      await ctx.ui.notify("Starting fresh session...", "info");
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
        withSession: async (replacementCtx) => {
          if (!editFlag) {
            // Auto-send the generated prompt
            await replacementCtx.sendUserMessage(finalPrompt);
          } else {
            // Show in editor for manual submit
            replacementCtx.ui.setEditorText(finalPrompt);
            replacementCtx.ui.notify("Restart ready. Submit when ready.", "info");
          }
        },
      });

      if (newSessionResult.cancelled) {
        await ctx.ui.notify("New session cancelled", "info");
      }
    },
  });
}
