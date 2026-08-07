import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Continual Harness — durable lessons with a promotion gradient.
 *
 * A port of the one mechanism that empirically works in Prime Agent's continual
 * harness (MIT, Prime Intellect / Mario Zechner), minus the parts that didn't.
 *
 * Measured on a real 10-session prime-agent harness: 82 session-local entries
 * produced 4 global memories, and those 4 were genuinely good while the 82 were
 * a work log with duplicate pairs and entries like "repository gate passes".
 * The value was never the four typed kinds (only `memory` was ever used) or the
 * refinement ledger (empty at global scope). It was the LOCAL -> GLOBAL GRADIENT:
 * write freely somewhere cheap, promote rarely to somewhere that persists.
 *
 * So this keeps the gradient and adds the three fixes that data suggested:
 *
 *   1. Two-session gate. A lesson promotes only when it recurs in a DIFFERENT
 *      session than the one that minted it. Transient notes ("the deploy box is
 *      down until I'm back") never survive that test; architectural traps do.
 *   2. Dedup on write. The source data re-recorded the same lesson under two
 *      slugs in consecutive events. Candidates are matched by token overlap.
 *   3. Evidence or it doesn't count. The source's `trigger` fields all read
 *      "Recorded the validated X fix" — the action, not the cause. Extraction
 *      here demands a concrete trace and drops anything without one.
 *
 * Storage (plain JSON, safe to read, edit, or delete by hand):
 *   ~/.pi/agent/harness/pending.json   candidates awaiting corroboration
 *   ~/.pi/agent/harness/global.json    promoted lessons, injected into the prompt
 *
 * Trigger: `session_before_compact`. Compaction is the moment context is about
 * to be destroyed, which makes it the right place to ask what was worth keeping.
 * Extraction is best-effort and never blocks or fails a compaction.
 *
 * Commands:
 *   /harness                 list promoted lessons for this project
 *   /harness pending         list candidates and their corroboration count
 *   /harness promote <n>     force-promote a candidate, skipping the gate
 *   /harness forget <n>      drop a promoted lesson
 *   /harness extract         run extraction now instead of waiting for compaction
 */

/** Reasoning effort for the extraction call. Raise if lessons come out shallow. */
const EXTRACTION_EFFORT = "medium" as const;
/** Distinct sessions a lesson must appear in before it goes global. */
const PROMOTION_THRESHOLD = 2;
/** Containment score above which two lessons are treated as the same lesson. */
const DEDUP_SIMILARITY = 0.7;
/** Below this many content words a lesson is too vague to match on containment alone. */
const MIN_DEDUP_TOKENS = 4;
/** Max promoted lessons injected into the system prompt per project. */
const MAX_INJECTED = 12;
/** Max characters of conversation handed to the extractor. */
const MAX_CONTEXT_CHARS = 60_000;

interface Lesson {
  id: string;
  /** Absolute cwd this lesson was learned in. Lessons are project-scoped. */
  project: string;
  /** The lesson itself, written to be actionable on a later turn. */
  text: string;
  /** Concrete trace that justifies it. Required — no evidence, no entry. */
  evidence: string;
  /** Distinct session ids this lesson has surfaced in. */
  sessions: string[];
  created: string;
  updated: string;
}

const harnessDir = (): string => join(homedir(), ".pi", "agent", "harness");
const pendingPath = (): string => join(harnessDir(), "pending.json");
const globalPath = (): string => join(harnessDir(), "global.json");

function load(path: string): Lesson[] {
  try {
    if (!existsSync(path)) return [];
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? (parsed as Lesson[]) : [];
  } catch {
    // A corrupt store must not take the session down with it.
    return [];
  }
}

function save(path: string, lessons: Lesson[]): void {
  mkdirSync(dirname(path), { recursive: true });
  // Write-then-rename so a crash mid-write cannot truncate the store.
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(lessons, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

/** Content words only, so wording changes don't defeat dedup. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

/**
 * Containment (overlap coefficient), not Jaccard.
 *
 * A re-recorded lesson is usually the same claim plus extra specifics, and
 * Jaccard punishes exactly that. Measured on the real duplicate pair
 * "per-commune lag seeding removes reform uplift" vs "per-commune lagged
 * carry-in removes the 2026 reform uplift": Jaccard 0.50 (missed), containment
 * 0.80 (caught). The token floor stops a short vague lesson from being
 * swallowed by any longer one that happens to contain its words.
 */
export function similarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size < MIN_DEDUP_TOKENS || right.size < MIN_DEDUP_TOKENS) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.min(left.size, right.size);
}

function findSimilar(lessons: Lesson[], text: string, project: string): Lesson | undefined {
  return lessons.find((l) => l.project === project && similarity(l.text, text) >= DEDUP_SIMILARITY);
}

function extractTextParts(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as { type?: string; text?: string };
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts;
}

function buildConversationText(entries: SessionEntry[]): string {
  const sections: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message?.role) continue;
    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractTextParts(entry.message.content).join("\n").trim();
    if (text.length > 0) sections.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
  }
  const joined = sections.join("\n\n");
  // Keep the tail: the end of a branch is where the hard-won conclusions are.
  return joined.length > MAX_CONTEXT_CHARS ? joined.slice(-MAX_CONTEXT_CHARS) : joined;
}

const EXTRACTION_PROMPT = `You are reviewing a coding session that is about to be compacted. Extract only lessons worth remembering weeks from now, in a different session.

A lesson qualifies ONLY if all of these hold:
- It is non-obvious. Someone competent would not guess it from reading the code.
- It is durable. It will still be true next month.
- It is causal. It explains a mechanism, not a status.
- You saw concrete evidence for it in this session. Not a plan, not an intention.

Reject anything that is:
- progress or status ("the test suite passes", "the refactor is done")
- a transient blocker ("the server is down until I'm back", "waiting on review")
- a restatement of what the code plainly says
- a summary of what you did

Most sessions yield ZERO lessons. Returning an empty array is the correct and common answer. Do not pad.

Return ONLY a JSON array, no prose, no code fence:
[{"text": "the lesson, imperative and specific, one to three sentences", "evidence": "the concrete trace that proves it, naming files, symptoms, or commands"}]`;

interface Extracted {
  text: string;
  evidence: string;
}

export function parseExtraction(raw: string): Extracted[] {
  // Models fence JSON despite instructions; recover the outermost array.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Extracted => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<Extracted>;
        return (
          typeof candidate.text === "string" &&
          typeof candidate.evidence === "string" &&
          candidate.text.trim().length > 0 &&
          // No evidence, no entry — this is the boilerplate filter.
          candidate.evidence.trim().length > 15
        );
      })
      .map((item) => ({ text: item.text.trim(), evidence: item.evidence.trim() }));
  } catch {
    return [];
  }
}

/**
 * Merge candidates into the pending store, promoting any that clear the gate.
 * Returns what changed so the caller can report it.
 */
export function absorb(
  extracted: Extracted[],
  sessionId: string,
  project: string,
): { promoted: Lesson[]; added: number; corroborated: number } {
  const pending = load(pendingPath());
  const promotedStore = load(globalPath());
  const promoted: Lesson[] = [];
  const now = new Date().toISOString();
  let added = 0;
  let corroborated = 0;

  for (const item of extracted) {
    // Already promoted? Record the sighting and move on.
    const existingGlobal = findSimilar(promotedStore, item.text, project);
    if (existingGlobal) {
      if (!existingGlobal.sessions.includes(sessionId)) {
        existingGlobal.sessions.push(sessionId);
        existingGlobal.updated = now;
      }
      continue;
    }

    const existing = findSimilar(pending, item.text, project);
    if (existing) {
      if (!existing.sessions.includes(sessionId)) {
        existing.sessions.push(sessionId);
        existing.updated = now;
        corroborated++;
      }
      // The gate: corroborated in a second distinct session.
      if (existing.sessions.length >= PROMOTION_THRESHOLD) {
        promotedStore.push(existing);
        promoted.push(existing);
        pending.splice(pending.indexOf(existing), 1);
      }
      continue;
    }

    pending.push({
      id: randomUUID(),
      project,
      text: item.text,
      evidence: item.evidence,
      sessions: [sessionId],
      created: now,
      updated: now,
    });
    added++;
  }

  save(pendingPath(), pending);
  save(globalPath(), promotedStore);
  return { promoted, added, corroborated };
}

function formatForPrompt(lessons: Lesson[]): string {
  const lines = [
    "# Durable lessons",
    "",
    "Learned in this project across earlier sessions and corroborated more than once.",
    "Treat them as established facts about this codebase, not suggestions.",
    "",
  ];
  for (const lesson of lessons.slice(0, MAX_INJECTED)) {
    lines.push(`- ${lesson.text}`);
  }
  return lines.join("\n");
}

export default function continualHarness(pi: ExtensionAPI) {
  /** Guards against overlapping extractions if compactions land back to back. */
  let extracting = false;

  const runExtraction = async (
    ctx: ExtensionContext,
    entries: SessionEntry[],
    announce: boolean,
  ): Promise<void> => {
    if (extracting) return;
    const model = ctx.model;
    if (!model) return;

    const conversation = buildConversationText(entries);
    if (conversation.trim().length < 500) return;

    extracting = true;
    try {
      const response = await ctx.modelRegistry.complete(
        model,
        {
          messages: [
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: `${EXTRACTION_PROMPT}\n\n---\n\n${conversation}` }],
              timestamp: Date.now(),
            },
          ],
        },
        { reasoningEffort: EXTRACTION_EFFORT, cacheRetention: "none", sessionId: randomUUID() },
      );

      const raw = response.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const extracted = parseExtraction(raw);
      if (extracted.length === 0) {
        if (announce && ctx.hasUI) ctx.ui.notify("Harness: nothing worth keeping", "info");
        return;
      }

      const { promoted, added, corroborated } = absorb(
        extracted,
        ctx.sessionManager.getSessionId(),
        ctx.cwd,
      );

      if (ctx.hasUI && (announce || promoted.length > 0)) {
        const parts: string[] = [];
        if (promoted.length > 0) parts.push(`${promoted.length} promoted`);
        if (corroborated > 0) parts.push(`${corroborated} corroborated`);
        if (added > 0) parts.push(`${added} pending`);
        if (parts.length > 0) ctx.ui.notify(`Harness: ${parts.join(", ")}`, "info");
      }
    } catch {
      // Extraction is a nicety. It must never take down a compaction or a turn.
    } finally {
      extracting = false;
    }
  };

  // Inject promoted lessons for this project into the turn's system prompt.
  pi.on("before_agent_start", (event, ctx) => {
    const project = ctx.cwd;
    const lessons = load(globalPath()).filter((lesson) => lesson.project === project);
    if (lessons.length === 0) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${formatForPrompt(lessons)}` };
  });

  // Compaction is about to destroy context. Ask what was worth keeping.
  pi.on("session_before_compact", async (event, ctx) => {
    await runExtraction(ctx, event.branchEntries, false);
  });

  pi.registerCommand("harness", {
    description: "Inspect durable lessons (list | pending | promote <n> | forget <n> | extract)",
    getArgumentCompletions: (prefix) => {
      const verbs = ["pending", "promote", "forget", "extract"];
      const matches = verbs.filter((verb) => verb.startsWith(prefix));
      return matches.length > 0 ? matches.map((verb) => ({ value: verb, label: verb })) : null;
    },
    handler: async (args, ctx) => {
      const project = ctx.cwd;
      const [verb, argument] = args.trim().split(/\s+/);

      if (verb === "extract") {
        if (ctx.hasUI) ctx.ui.notify("Harness: extracting...", "info");
        await runExtraction(ctx, ctx.sessionManager.getBranch(), true);
        return;
      }

      if (verb === "pending") {
        const pending = load(pendingPath()).filter((lesson) => lesson.project === project);
        if (pending.length === 0) {
          ctx.ui.notify("No pending candidates for this project", "info");
          return;
        }
        const listing = pending
          .map((lesson, index) => `${index + 1}. [${lesson.sessions.length}/${PROMOTION_THRESHOLD}] ${lesson.text}`)
          .join("\n");
        ctx.ui.notify(`Pending candidates:\n${listing}`, "info");
        return;
      }

      if (verb === "promote") {
        const pending = load(pendingPath());
        const scoped = pending.filter((lesson) => lesson.project === project);
        const target = scoped[Number(argument) - 1];
        if (!target) {
          ctx.ui.notify(`No pending candidate ${argument}`, "warning");
          return;
        }
        const promotedStore = load(globalPath());
        promotedStore.push(target);
        pending.splice(pending.indexOf(target), 1);
        save(globalPath(), promotedStore);
        save(pendingPath(), pending);
        ctx.ui.notify(`Promoted: ${target.text}`, "info");
        return;
      }

      if (verb === "forget") {
        const promotedStore = load(globalPath());
        const scoped = promotedStore.filter((lesson) => lesson.project === project);
        const target = scoped[Number(argument) - 1];
        if (!target) {
          ctx.ui.notify(`No promoted lesson ${argument}`, "warning");
          return;
        }
        promotedStore.splice(promotedStore.indexOf(target), 1);
        save(globalPath(), promotedStore);
        ctx.ui.notify(`Forgot: ${target.text}`, "info");
        return;
      }

      const lessons = load(globalPath()).filter((lesson) => lesson.project === project);
      if (lessons.length === 0) {
        ctx.ui.notify("No durable lessons for this project yet", "info");
        return;
      }
      const listing = lessons
        .map((lesson, index) => `${index + 1}. ${lesson.text}\n   evidence: ${lesson.evidence}`)
        .join("\n\n");
      ctx.ui.notify(`Durable lessons:\n${listing}`, "info");
    },
  });
}
