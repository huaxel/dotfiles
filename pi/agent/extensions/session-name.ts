/**
 * Session naming.
 *
 * Auto-names sessions after first turn from the user's message.
 * Use /session-name [name] to override.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
    const userMsg = branch.find(e => e.type === "message" && e.message.role === "user");
    if (!userMsg) return;

    const text = userMsg.message.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map(c => c.text).join(" ").trim();
    if (!text) return;

    const project = ctx.cwd.split("/").filter(Boolean).pop()?.replace(/^--|--$/g, "").replace(/[-_]/g, " ")
      ?.replace(/\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) || "";

    const name = heuristicName(text);
    if (!name) return;

    const fullName = project ? `${project}: ${name}` : name;
    pi.setSessionName(fullName);
    hasNamed = true;
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
