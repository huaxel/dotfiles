import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai";

const NAMING_PROMPT = `You are a session naming assistant. Given a user request, generate a short, descriptive name.

Rules:
- Use kebab-case (lowercase, words separated by hyphens)
- Max 3-4 words
- Describe the main task or topic
- No articles, no punctuation
- Be concise

Examples:
- "fix the login authentication bug" → fix-login-auth
- "refactor the database layer to use Prisma" → refactor-db-prisma
- "implement OAuth authentication for team features" → oauth-teams
- "review my pull request and give feedback" → review-pr

User request:`;

export default function (pi: ExtensionAPI) {
  let hasNamed = false;

  pi.on("session_start", async () => {
    hasNamed = false;
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (hasNamed || ctx.mode !== "tui") return;

    const branch = ctx.sessionManager.getBranch();
    const firstUser = branch.find(
      (e) => e.type === "message" && e.message.role === "user"
    );
    if (!firstUser) return;

    const text = firstUser.message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join(" ")
      .slice(0, 300);

    if (!text.trim()) return;

    // Try Gemini Flash first (cheap), fallback to current model
    const model = ctx.modelRegistry.find("google", "gemini-2.5-flash") || ctx.model;
    if (!model) return;

    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) return;

      const response = await complete(
        model,
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
        { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 20 },
      );

      const name = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);

      if (name) {
        pi.setSessionName(name);
        hasNamed = true;
        ctx.ui.notify(`Session: ${name}`, "info");
      }
    } catch (err) {
      console.error("Auto-naming failed:", err);
    }
  });

  pi.registerCommand("session-name", {
    description: "Set or show session name",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (name) {
        pi.setSessionName(name);
        hasNamed = true;
        ctx.ui.notify(`Session named: ${name}`, "info");
      } else {
        const current = pi.getSessionName();
        ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
      }
    },
  });
}
