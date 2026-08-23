// M3 document-first mode tests (pure buildSystemPrompt + directive).
// Run: node pi/agent/extensions/worksheet-mode.test.mjs
import { register } from "node:module";

register(new URL("./pi-resolve-hook.mjs", import.meta.url), import.meta.url);

const { DOCUMENT_FIRST_DIRECTIVE, buildSystemPrompt } = await import(new URL("./worksheet-loop.ts", import.meta.url));

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// Directive is a real, non-empty routing instruction.
assert(DOCUMENT_FIRST_DIRECTIVE.includes("document-first mode"), "directive mentions document-first");
assert(DOCUMENT_FIRST_DIRECTIVE.includes("Do not duplicate"), "directive forbids duplication");

// Document-first on: directive appended after the skill.
{
  const out = buildSystemPrompt("base", { documentFirst: true, skillContent: "SKILL" });
  assert(out.startsWith("base"), "base prompt preserved");
  assert(out.includes("\n\nSKILL"), "skill appended");
  assert(out.includes(DOCUMENT_FIRST_DIRECTIVE), "directive appended when document-first on");
}

// Document-first off: directive NOT appended; skill still is.
{
  const out = buildSystemPrompt("base", { documentFirst: false, skillContent: "SKILL" });
  assert(out.includes("\n\nSKILL"), "skill still appended off-mode");
  assert(!out.includes(DOCUMENT_FIRST_DIRECTIVE), "directive omitted when document-first off");
}

// Empty skill content: nothing extra unless directive applies.
{
  const out = buildSystemPrompt("base", { documentFirst: false, skillContent: "" });
  assert(out === "base", "no skill, no directive -> unchanged");
}

console.log("worksheet document-first mode tests passed");