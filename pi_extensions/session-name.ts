import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai";

const NAMING_PROMPT = `You are a session naming assistant. Given a user request, generate a short, descriptive name for the session.

Rules:
- 2-6 words
- Sentence-like, Title Case (e.g. "Fix Login Auth Bug", never "fix-login-auth")
- Describe the main task or topic — favour specifics over generic words
- No punctuation, no quotation marks, no trailing period
- Be concise but descriptive — prefer specific nouns over filler

Examples:
- "fix the login authentication bug" → "Fix Login Auth Bug"
- "refactor database layer to Prisma" → "Refactor DB to Prisma"
- "implement OAuth for team features" → "Implement OAuth for Teams"
- "review my pull request and give feedback" → "Review PR"
- "write tests for the payment API endpoint" → "Test Payment API"

User request:`;

/** Fallback: extract a descriptive title from the prompt text without an LLM call. */
function heuristicName(text: string): string {
  // Strip common polite prefixes
  const cleaned = text
    .replace(
      /^(can we|could you|please |i need to|i want to|let's |how do i |how to |can you |would you |could we )/i,
      "",
    )
    .replace(/^(im |i am )/i, "")
    .trim();

  // Take first sentence or first 100 chars
  const firstSentence = cleaned.split(/[.!?;]/)[0].trim();
  const truncated =
    firstSentence.length > 100
      ? firstSentence.slice(0, 97) + "..."
      : firstSentence;

  // Strip articles
  const noArticles = truncated.replace(/\b(a|an|the)\s+/gi, "");

  // Keep max 6 meaningful words
  const words = noArticles.split(/\s+/).filter(Boolean);
  const short = words.slice(0, 6).join(" ");
  if (short.length < 3) return "";

  // Title case (handle common abbreviations)
  return short
    .split(" ")
    .map((w) => {
      if (/^[A-Z]{2,}$/.test(w)) return w; // preserve all-caps abbrevs
      return w[0]?.toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export default function (pi: ExtensionAPI) {
  let hasNamed = false;

  pi.on("session_start", async (event) => {
    // Only auto-name fresh sessions, not resumed or forked ones
    if (event.reason === "new" || event.reason === "startup") {
      hasNamed = false;
    } else {
      hasNamed = true; // skip rename on resume / fork
    }
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (hasNamed || ctx.mode !== "tui") return;

    // Grab the first user message in the current branch
    const branch = ctx.sessionManager.getBranch();
    const firstUser = branch.find(
      (e) => e.type === "message" && e.message.role === "user",
    );
    if (!firstUser) return;

    const text = firstUser.message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join(" ")
      .slice(0, 300);

    if (!text.trim()) return;

    // ── Try cheap/free models in order ──────────────────────────
    const cheapModels = [
      ctx.modelRegistry.find("opencode", "deepseek-v4-flash-free"),
      ctx.modelRegistry.find("nan", "deepseek-v4-flash"),
      ctx.modelRegistry.find("nan", "qwen3.6"),
      ctx.modelRegistry.find("llamacpp", "Qwen3.6-27B-MTP"),
    ].filter(Boolean);

    for (const model of cheapModels) {
      try {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model!);
        if (!auth.ok || !auth.apiKey) continue;

        const response = await complete(
          model!,
          {
            systemPrompt: NAMING_PROMPT,
            messages: [
              {
                role: "user",
                content: [{ type: "text", text }],
                timestamp: Date.now(),
              },
            ],
          },
          { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 30 },
        );

        const raw = response.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("")
          .trim()
          .replace(/^["'"]|["'"]$/g, "")
          .trim();

        // Reject if it's empty, too short, or still kebab-case
        if (raw && raw.length > 3 && !/^[a-z0-9-]+$/.test(raw)) {
          pi.setSessionName(raw);
          hasNamed = true;
          ctx.ui.notify(`Session: ${raw}`, "info");
          return;
        }
      } catch {
        continue; // try next model
      }
    }

    // ── Fallback: pure heuristic ────────────────────────────────
    const fallback = heuristicName(text);
    if (fallback) {
      pi.setSessionName(fallback);
      hasNamed = true;
    }
  });

  pi.registerCommand("session-name", {
    description: "Set or show session name. Usage: /session-name [name]",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (name) {
        pi.setSessionName(name);
        hasNamed = true;
        ctx.ui.notify(`Session named: ${name}`, "info");
      } else {
        const current = pi.getSessionName();
        ctx.ui.notify(
          current ? `Session: ${current}` : "No session name set",
          "info",
        );
      }
    },
  });
}
