/**
 * Session naming.
 *
 * Auto-names sessions after first turn: tries a cheap LLM first
 * (asked vs done), falls back to heuristic from user message.
 * Use /session-name [name] to override.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai";

const SYSTEM_PROMPT = `You are a session naming assistant. Given what the user asked and what was done, generate a short session name.

Rules:
- 2-6 words, Title Case
- Project prefix added automatically, omit it
- Base on the done part, not just the ask
- Be specific: include the model, API, framework, or file involved
- Only the name, nothing else
- No punctuation, no quotes, no trailing period

Examples:
Asked: "can you review the changes" Done: "reviewed the diff, caught a bug" → "Review Config Changes"
Asked: "try this hipfire thing" Done: "cloned hipfire, ran benchmarks against llamacpp Vulkan" → "Benchmark Hipfire vs Llamacpp"
Asked: "set the atom data root" Done: "configured ATOM_DATA_ROOT env var in bashrc, sourced it" → "Set Atom Data Root"`;

function heuristicName(text: string): string {
  let clean = text.replace(/https?:\/\/\S+/g, "").replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  const firstSentence = clean.split(/[.!?;]/)[0].trim().slice(0, 120);
  const words = firstSentence.split(/\s+/).filter(w => w.length > 1).slice(0, 6);
  if (words.length < 2) return "";
  return words.map(w => /^[A-Z]{2,}$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ").replace(/[,;:.!?\s]+$/g, "");
}

export default function (pi: ExtensionAPI) {
  let hasNamed = false;

  pi.on("session_start", (event) => {
    if (event.reason === "new" || event.reason === "startup") hasNamed = false;
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (hasNamed || ctx.mode !== "tui") return;

    const branch = ctx.sessionManager.getBranch();
    const entries = branch.filter(e => e.type === "message");

    const userEntry = entries.find(e => e.message.role === "user");
    const asstEntry = entries.find(e => e.message.role === "assistant");
    if (!userEntry) return;

    const extract = (entry: typeof userEntry) => entry.message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map(c => c.text).join(" ").trim();

    const userText = extract(userEntry);
    if (!userText) return;

    const project = ctx.cwd.split("/").filter(Boolean).pop()?.replace(/^--|--$/g, "").replace(/[-_]/g, " ")
      ?.replace(/\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) || "";

    // Try cheap LLM once
    const cheapModel = ctx.modelRegistry.find("opencode", "deepseek-v4-flash-free")
      || ctx.modelRegistry.find("nan", "deepseek-v4-flash")
      || ctx.modelRegistry.find("nan", "qwen3.6")
      || ctx.modelRegistry.find("llamacpp", "Qwen3.6-27B-MTP");

    if (cheapModel) {
      try {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(cheapModel);
        if (auth.ok && auth.apiKey) {
          const asstText = asstEntry ? extract(asstEntry).slice(0, 300) : "";
          const context = `Asked: ${userText.slice(0, 200)}\nDone: ${asstText || "(in progress)"}`;
          const response = await complete(
            cheapModel,
            { systemPrompt: SYSTEM_PROMPT, messages: [{ role: "user", content: [{ type: "text", text: context }], timestamp: Date.now() }] },
            { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 50 },
          );
          const raw = response.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map(c => c.text).join("").replace(/^["']|["']$/g, "").trim();
          if (raw && raw.length > 3 && !/^[a-z0-9-]+$/.test(raw)) {
            const fullName = project ? `${project}: ${raw}` : raw;
            pi.setSessionName(fullName);
            hasNamed = true;
            return;
          }
        }
      } catch { /* fall through to heuristic */ }
    }

    // Fallback: heuristic from user message only
    const name = heuristicName(userText);
    if (name) {
      pi.setSessionName(project ? `${project}: ${name}` : name);
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
        ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
      }
    },
  });
}
