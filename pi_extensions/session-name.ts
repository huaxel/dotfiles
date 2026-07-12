import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai";

const NAMING_PROMPT = `You are a session naming assistant. Given a user request, generate a descriptive session name.

Rules:
- 3-8 words, Title Case (e.g. "Fix Login Auth Redirect", never kebab-case)
- Include the SPECIFIC task or topic — not just the action. "Review PR" → "Review PR Feedback". "Add auth" → "Add OAuth JWT Auth".
- No punctuation, no quotation marks, no trailing period
- Prefer concrete nouns over filler: which model, which API, which feature
- If the request mentions a specific tool, framework, or file, include it
- Only the name, nothing else

Examples:
- "review my pull request and give feedback" → "Review PR Feedback"
- "fix the login authentication bug with redirect loop" → "Fix Login Auth Redirect"
- "refactor the database layer to use Prisma ORM" → "Refactor Database To Prisma Orm"
- "implement OAuth authentication for team billing features" → "Implement OAuth Team Billing"
- "write unit tests for the Stripe payment API endpoint" → "Write Stripe Payment Api Tests"
- "investigate why the USB mount keeps failing on boot" → "Debug Usb Mount Boot Failure"
- "help me review and improve the agents md for this repo" → "Improve Agents Md Setup"
- "compare hipfire vs llamacpp benchmark results on strix halo" → "Benchmark Hipfire Vs Llamacpp"

User request:`;

/** Fallback: extract a descriptive title from the prompt text without an LLM call. */
function heuristicName(text: string): string {
  // Remove noise: URLs, markdown, code blocks, shell prompts
  let clean = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\w@.-]+@[\w.-]+\s*[~\w]*\s*\S*\s*❯?\s*/m, "");

  // Strip polite prefixes
  clean = clean
    .replace(
      /^(can we|could you|please |i need to|i want to|let's |how do i |how to |can you |would you |could we |help me )/i,
      "",
    )
    .replace(/^(im |i am )/i, "")
    .trim();

  // Take first sentence
  const firstSentence = clean.split(/[.!?;]/)[0].trim();
  const truncated = firstSentence.slice(0, 120);

  // Strip articles, filler at end
  let stripped = truncated
    .replace(/\b(a|an|the|this|that|in|on|for)\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Keep max 6 meaningful words (skip single-char noise)
  const words = stripped.split(/\s+/).filter((w) => w.length > 1);
  const short = words.slice(0, 6).join(" ");
  if (short.length < 3) return "";

  // Title case, preserve all-caps abbrevs
  const titled = short
    .split(" ")
    .map((w) => {
      if (/^[A-Z]{2,}$/.test(w)) return w;
      return w[0]?.toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");

  // Strip trailing punctuation
  return titled.replace(/[,;:.!?\s]+$/g, "");
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
          { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 50 },
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
