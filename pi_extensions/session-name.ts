import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai";

const NAMING_PROMPT = `You are a session naming assistant. Given what the user ASKED and what was actually DONE, generate a descriptive session name that captures the REAL work.

Rules:
- 3-8 words, Title Case (e.g. "Dotfiles: Review PR Feedback")
- START with the project name followed by a colon and space, then the specific task
- Base the name on the "Done" part — the actual outcome, not just the initial ask
- Include specifics: which model, API, framework, or file was involved
- No punctuation, no quotation marks, no trailing period
- Only the name, nothing else

Examples:
- project: "Dotfiles", asked: "can you review the changes", done: "reviewed the diff, caught a bug in the npmrc, cleaned up pi_settings" → "Dotfiles: Review Config Changes"
- project: "Ai Inference Bench", asked: "try this hipfire thing", done: "cloned hipfire, ran benchmarks against llamacpp Vulkan, compared t/s on Strix Halo" → "Ai Inference Bench: Benchmark Hipfire vs Llamacpp"
- project: "Project Atom", asked: "set the atom data root", done: "configured ATOM_DATA_ROOT env var in bashrc, sourced it, verified with atom info" → "Project Atom: Set Atom Data Root"

Project: PROJECT_NAME
Context:`;

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

  pi.on("turn_end", async (_event, ctx) => {
    if (hasNamed || ctx.mode !== "tui") return;

    // Derive project label from cwd (Title Case)
    const projectLabel = ctx.cwd
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/^--|--$/g, "")
      ?.replace(/[-_]/g, " ")
      ?.replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) || "";

    // Get first user message + first assistant response for richer context
    const branch = ctx.sessionManager.getBranch();
    const msgs = branch.filter(
      (e) => e.type === "message" &&
        (e.message.role === "user" || e.message.role === "assistant"),
    );

    const userMsg = msgs.find((e) => e.message.role === "user");
    const asstMsg = msgs.find((e) => e.message.role === "assistant");
    if (!userMsg) return;

    const userText = userMsg.message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join(" ");

    // Build a compact summary of what was asked AND what was done
    let nameContext = "Asked: " + userText.slice(0, 200);
    if (asstMsg) {
      const reply = asstMsg.message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join(" ")
        .slice(0, 300);
      nameContext += "\nDone: " + reply;
    }

    if (!userText.trim()) return;

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

        const fullPrompt = NAMING_PROMPT.replace("PROJECT_NAME", projectLabel)
          + "\n" + nameContext;

        const response = await complete(
          model!,
          {
            systemPrompt: fullPrompt,
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: nameContext }],
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
    const fallback = projectLabel
      ? projectLabel + ": " + heuristicName(userText)
      : heuristicName(userText);
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
