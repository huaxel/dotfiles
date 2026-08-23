/**
 * Worksheet Loop — shared markdown task document for human↔agent collaboration.
 *
 * The agent creates a file in `.worksheets/ws-<epoch>-<slug>.md`, writes progress
 * into it, and re-reads it when the human edits it.  Normal chat still works too.
 *
 * Companion skill: skills/worksheet-loop/SKILL.md (injected into system prompt
 * via before_agent_start).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

// ── pure block-identity core (module scope, unit-testable) ────────────────
// Marks a Markdown section with a stable id that survives edits, heading
// renames, block-shift/reordering, and rewrites within a section.  Ids are
// stored in a sidecar (`block-ids.json`) rather than in the visible Markdown.

export type BlockRecord = { id: string; heading: string; body: string };
export type BlockSection = { heading: string; body: string };

export function normalizeBlockHeading(heading: string): string {
  return heading.toLowerCase().replace(/\s+/g, " ").trim();
}

function blockTokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
}

/** Jaccard overlap of lowercase word tokens in [0, 1]. */
export function contentSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = blockTokens(a);
  const tb = blockTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Reconcile current sections against previously persisted block ids.  Each
 * section is matched to the best unused existing block by heading match
 * (0.5) plus body similarity; a match preserves the id across edits,
 * renames, and reordering.  Unmatched sections get a fresh id (first save or
 * a genuinely new block).  Returns the reconciled records plus the ids whose
 * body changed this revision.
 */
export function reconcileBlockIds(
  existing: BlockRecord[],
  sections: BlockSection[],
  makeId: (heading: string, body: string) => string,
): { records: BlockRecord[]; changed: string[] } {
  const taken = new Set<string>();
  const records: BlockRecord[] = [];
  const changed: string[] = [];

  for (const section of sections) {
    const heading = normalizeBlockHeading(section.heading);
    let best: BlockRecord | null = null;
    let bestScore = 0;
    for (const cand of existing) {
      if (taken.has(cand.id)) continue;
      const sameHeading = normalizeBlockHeading(cand.heading) === heading ? 0.5 : 0;
      const score = sameHeading + contentSimilarity(cand.body, section.body);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    if (best && bestScore >= 0.35) {
      taken.add(best.id);
      if (best.body !== section.body) changed.push(best.id);
      records.push({ id: best.id, heading: section.heading, body: section.body });
    } else {
      const id = makeId(heading, section.body);
      records.push({ id, heading: section.heading, body: section.body });
      changed.push(id); // a brand-new block counts as a content change
    }
  }
  return { records, changed };
}

export default function (pi: ExtensionAPI) {
  const WORKSHEETS_DIR = ".worksheets";
  const attachedFiles = new Set<string>();

  // ── loop guard ──────────────────────────────────────────────────────────

  /** Stored content per file for loop prevention and human change summaries. */
  type FileState = { exact: string; norm: string; content: string };
  const fileState = new Map<string, FileState>();

  function fileHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /** Hash of the content with all whitespace collapsed (ignores formatting-only changes). */
  function normalizedHash(content: string): string {
    return crypto.createHash("sha256")
      .update(content.replace(/\s+/g, " ").trim())
      .digest("hex");
  }

  function rememberFile(filePath: string, content: string): void {
    fileState.set(filePath, {
      exact: fileHash(content),
      norm: normalizedHash(content),
      content,
    });
  }

  /** Summarize the changed line range so deletions become visible to Pi. */
  function summarizeChange(previous: string | undefined, current: string): string {
    if (previous === undefined) return "(initial document state)";

    const before = previous.split(/\r?\n/);
    const after = current.split(/\r?\n/);
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) {
      start++;
    }

    let beforeEnd = before.length;
    let afterEnd = after.length;
    while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
      beforeEnd--;
      afterEnd--;
    }

    const removed = before.slice(start, beforeEnd).map((line) => `- ${line}`);
    const added = after.slice(start, afterEnd).map((line) => `+ ${line}`);
    const changes = [...removed, ...added];
    const limit = 80;
    if (changes.length > limit) {
      return `${changes.slice(0, limit).join("\n")}\n... (${changes.length - limit} more changed lines)`;
    }
    return changes.length > 0 ? changes.join("\n") : "(content changed)";
  }

  type MarkdownSection = {
    key: string;
    heading: string;
    text: string;
    body: string;
  };

  function markdownSections(content: string): Map<string, MarkdownSection> {
    const sections = new Map<string, MarkdownSection>();
    const lines = content.split(/\r?\n/);
    let heading = "Document preamble";
    let headingLine = "";
    let body: string[] = [];
    const headingCounts = new Map<string, number>();

    const flush = (): void => {
      const baseKey = heading.toLowerCase();
      const occurrence = headingCounts.get(baseKey) ?? 0;
      headingCounts.set(baseKey, occurrence + 1);
      const key = `${baseKey}#${occurrence}`;
      const bodyText = body.join("\n");
      sections.set(key, {
        key,
        heading,
        text: headingLine ? `${headingLine}\n${bodyText}` : bodyText,
        body: bodyText,
      });
    };

    for (const line of lines) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (match) {
        flush();
        heading = match[2];
        headingLine = line;
        body = [];
      } else {
        body.push(line);
      }
    }
    flush();
    return sections;
  }

  /** Describe only the Markdown sections whose saved content changed. */
  function summarizeSections(previous: string | undefined, current: string): string {
    const before = markdownSections(previous ?? "");
    const after = markdownSections(current);
    const keys = [...new Set([...before.keys(), ...after.keys()])];
    const changed = keys.filter((key) => before.get(key)?.text !== after.get(key)?.text);
    if (changed.length === 0) return "(content changed outside a Markdown section)";

    const sections = changed.slice(0, 12).map((key) => {
      const oldSection = before.get(key);
      const newSection = after.get(key);
      const title = newSection?.heading ?? oldSection?.heading ?? "Unknown section";
      const status = !oldSection ? "added" : !newSection ? "removed" : "changed";
      const diff = summarizeChange(oldSection?.body, newSection?.body ?? "");
      const current = newSection?.text ?? "(section removed)";
      return `## ${title} — ${status}\n${diff}\n\nCurrent section:\n${current}`;
    });

    if (changed.length > sections.length) {
      sections.push(`... (${changed.length - sections.length} more changed sections)`);
    }
    return sections.join("\n\n");
  }

  // ── durable history sidecar + stable block identities ──────────────────
  //
  // Append-only audit log per worksheet:
  //   .worksheets/.history/<id>/events.jsonl   — revision event log
  //   .worksheets/.history/<id>/block-ids.json — stable block id map
  //
  // The human-facing Markdown stays the live view; the sidecar is the
  // materialized/durable state (Zed's DeltaDB ~append-only deltas over a
  // real worktree).  Block ids are reconciled across saves by content+
  // heading similarity so edits, heading renames, and section reordering do
  // NOT churn the ids, and the ids are kept OUT of the visible Markdown
  // (Zed's logical-anchors lesson: stable identities, not heading occurrence
  // keys).

  let currentConversation = "unknown";
  let currentTurn = 0;

  const HISTORY_ROOT = path.resolve(WORKSHEETS_DIR, ".history");

  function shortHash(hex: string): string {
    return hex.slice(0, 12);
  }

  function historyIdFor(filePath: string): string {
    const rel = path.relative(process.cwd(), filePath).replace(/\.md$/i, "");
    return slugify(rel.replace(/[\\/]+/g, "-")) || "worksheet";
  }
  function historyDirFor(filePath: string): string {
    return path.join(HISTORY_ROOT, historyIdFor(filePath));
  }
  function eventsPathFor(filePath: string): string {
    return path.join(historyDirFor(filePath), "events.jsonl");
  }
  function blockIdsPathFor(filePath: string): string {
    return path.join(historyDirFor(filePath), "block-ids.json");
  }

  function loadBlockRecords(filePath: string): BlockRecord[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(blockIdsPathFor(filePath), "utf-8"));
      if (parsed && Array.isArray(parsed.blocks)) return parsed.blocks;
    } catch {
      // first save
    }
    return [];
  }
  function saveBlockRecords(filePath: string, blocks: BlockRecord[]): void {
    try {
      fs.mkdirSync(historyDirFor(filePath), { recursive: true });
      fs.writeFileSync(
        blockIdsPathFor(filePath),
        JSON.stringify({ version: 1, blocks }, null, 2),
        "utf-8",
      );
    } catch {
      // storage is best-effort
    }
  }

  /**
   * Reconcile the saved revision against persisted block ids so identity
   * survives edits, renames, and reordering.  Returns the current block
   * records and the subset of ids whose content changed this revision.
   */
  function reconcileBlocks(filePath: string, current: Map<string, MarkdownSection>): {
    records: BlockRecord[];
    changed: string[];
  } {
    const existing = loadBlockRecords(filePath);
    const sections: BlockSection[] = [...current.values()].map((s) => ({
      heading: s.heading,
      body: s.body,
    }));
    const makeId = (heading: string, body: string): string => {
      const digest = crypto.createHash("sha256")
        .update(`${filePath}:${heading}:${body}`)
        .digest("hex");
      return `block-${shortHash(digest)}`;
    };
    const result = reconcileBlockIds(existing, sections, makeId);
    saveBlockRecords(filePath, result.records);
    return result;
  }

  function appendEventLine(filePath: string, event: Record<string, unknown>): void {
    try {
      fs.mkdirSync(historyDirFor(filePath), { recursive: true });
      fs.appendFileSync(eventsPathFor(filePath), JSON.stringify(event) + "\n", "utf-8");
    } catch {
      // audit log is best-effort
    }
  }

  function changedSectionKeys(previous: string | undefined, current: string): string[] {
    const before = markdownSections(previous ?? "");
    const after = markdownSections(current);
    const keys = [...new Set([...before.keys(), ...after.keys()])];
    return keys.filter((key) => before.get(key)?.text !== after.get(key)?.text);
  }

  /**
   * Persist the current save as an event (revision id, parent revision,
   * actor, changed sections, operation summary, conversation/turn id) and
   * reconcile stable block identities.  Returns the human-facing change
   * summary, or null when there is no meaningful change to surface.
   */
  function recordRevision(filePath: string, actor: "human" | "agent"): string | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.trim()) return null;
      const prev = fileState.get(filePath);
      const exact = fileHash(content);
      if (prev && prev.exact === exact) return null; // no change
      const norm = normalizedHash(content);
      if (prev && prev.norm === norm) {
        rememberFile(filePath, content); // whitespace-only: don't log or steer
        return null;
      }

      const sections = changedSectionKeys(prev?.content, content);
      const ops = summarizeChange(prev?.content, content);
      const revision = shortHash(exact);
      const parent = prev ? shortHash(prev.exact) : null;
      const changeSummary = summarizeSections(prev?.content, content);
      const { changed } = reconcileBlocks(filePath, markdownSections(content));

      appendEventLine(filePath, {
        revision,
        parent,
        actor,
        sections,
        ops,
        blocks: changed,
        conversation: currentConversation,
        turn: currentTurn,
        ts: new Date().toISOString(),
      });

      rememberFile(filePath, content);
      return changeSummary;
    } catch {
      return null;
    }
  }

  function isWorksheetPath(absPath: string): boolean {
    const normalizedPath = path.resolve(absPath);
    const parts = normalizedPath.replace(/\/$/, "").split(path.sep);
    return normalizedPath.endsWith(".md") && (
      parts.includes(WORKSHEETS_DIR) || attachedFiles.has(normalizedPath)
    );
  }

  // ── detect agent writes to .worksheets/ files ───────────────────────────
  //
  // Three-layer guard against re-injection loops:
  //   1. Process-local flag — set in tool_call (before the tool runs).
  //   2. Filesystem sentinel (.ws-lock) — written on arm so OTHER pi
  //      processes (subagents) see that a write is in flight.
  //   3. Hash bookkeeping — on a guarded skip we still update the stored
  //      hash, so a later spurious fs.watch event (guard down) matches
  //      instead of injecting.
  //
  // Lifecycle: arm() on tool_call, disarm() on tool_execution_end.  The
  // timer is a CRASH SAFETY-NET only (a process that dies mid-write would
  // otherwise leave a permanent sentinel).  The 1s timer was too short:
  // the edit tool + cross-process fs.watch delivery took ~1.025s, so the
  // parent saw no sentinel and injected.  disarm() now removes the
  // sentinel on confirmed completion; the timer is the fallback at 30s,
  // matching the watcher's stale-lock window.

  const SENTINEL = path.resolve(WORKSHEETS_DIR, ".ws-lock");

  const worksheetGuard = {
    active: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    arm(targetPath: string) {
      if (targetPath && isWorksheetPath(path.resolve(targetPath))) {
        this.active = true;
        if (this.timer) clearTimeout(this.timer);
        // Crash safety-net: if this process dies before disarm(), the
        // sentinel must not stay forever.  30s matches the watcher's
        // stale-lock threshold so a dead process is cleaned up promptly.
        this.timer = setTimeout(() => {
          this.active = false;
          this.timer = null;
          try { fs.unlinkSync(SENTINEL); } catch { /* ignore */ }
        }, 30_000);
        // Cross-process sentinel: touch file so other pi sessions see it
        try { fs.writeFileSync(SENTINEL, String(process.pid)); } catch { /* ignore */ }
      }
    },
    disarm() {
      this.active = false;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      try { fs.unlinkSync(SENTINEL); } catch { /* ignore */ }
    },
  };

  // tool_call has event.input; tool_execution_end does NOT (only result).
  // Track the arming path per toolCallId so disarm can run even though the
  // end event lacks the input fields.
  const armedPaths = new Map<string, string>();

  pi.on("tool_call", (event) => {
    if (!event.toolName || !["write", "edit"].includes(event.toolName)) return;
    const args = (event.input ?? {}) as Record<string, unknown>;
    const targetPath = (args.path ?? args.file ?? "") as string;
    if (targetPath && isWorksheetPath(path.resolve(targetPath))) {
      armedPaths.set(event.toolCallId, path.resolve(targetPath));
      worksheetGuard.arm(targetPath);
    }
  });

  pi.on("tool_execution_end", (event) => {
    if (!event.toolName || !["write", "edit"].includes(event.toolName)) return;
    const armedPath = armedPaths.get(event.toolCallId);
    if (armedPath) {
      armedPaths.delete(event.toolCallId);
      worksheetGuard.disarm();
      // Record the agent's own write in the audit log.  Recording is
      // distinct from steering: we log actor "agent" but never re-inject
      // the change as a worksheet update.  This also refreshes the stored
      // hash, so a later spurious fs.watch event cannot re-inject it.
      recordRevision(armedPath, "agent");
    }
  });

  // ── load skill on every turn ────────────────────────────────────────────
  //
  // Resolve SKILL.md relative to this extension file, strip YAML frontmatter,
  // and inject into the system prompt each turn.

  const skillPath = path.resolve(__dirname, "../skills/worksheet-loop/SKILL.md");

  function loadSkillContent(): string {
    try {
      let raw = fs.readFileSync(skillPath, "utf-8");
      // Strip YAML frontmatter (---\n...\n---)
      raw = raw.replace(/^---[\s\S]*?---\n*/, "");
      return raw.trim();
    } catch {
      return "";
    }
  }

  pi.on("before_agent_start", (event) => {
    const instructions = loadSkillContent();
    if (instructions) {
      event.systemPrompt += `\n\n${instructions}`;
    }
  });

  // ── watch .worksheets/ for human edits ──────────────────────────────────

  let watcherPaused = false;
  let closeWatcher: (() => void) | null = null;
  let rescanWatcher: (() => void) | null = null;
  let attachWatcher: ((filePath: string) => boolean) | null = null;

  pi.on("session_start", (_event, ctx) => {
    const worksheetsAbs = path.resolve(WORKSHEETS_DIR);
    currentConversation = ctx.sessionManager.getSessionFile() ?? "unknown";
    currentTurn = 0;

    // A reload can emit session_start more than once. Close the old watcher
    // first so edits are never delivered twice.
    closeWatcher?.();

    // Seed hashes for any existing files so we don't re-inject them
    seedExistingHashes(worksheetsAbs);

    // Ensure the directory exists so fs.watch has something to latch onto
    if (!fs.existsSync(worksheetsAbs)) {
      fs.mkdirSync(worksheetsAbs, { recursive: true });
    }

    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const fileWatchers = new Map<string, fs.FSWatcher>();

    const processChange = (filePath: string): void => {
      if (watcherPaused) return;
      const filename = path.relative(process.cwd(), filePath) || path.basename(filePath);

      // Guarded: an agent (this process or another) is writing. Skip
      // injection, but refresh the stored hash so a later fs.watch event
      // cannot re-inject the agent's own write.
      if (worksheetGuard.active || fs.existsSync(SENTINEL)) {
        if (fs.existsSync(SENTINEL)) {
          try {
            const age = Date.now() - fs.statSync(SENTINEL).mtimeMs;
            if (age >= 30_000) {
              fs.unlinkSync(SENTINEL); // stale lock from a crashed process
            } else {
              try {
                const content = fs.readFileSync(filePath, "utf-8");
                if (content.trim()) {
                  rememberFile(filePath, content);
                }
              } catch { /* raced */ }
              return;
            }
          } catch {
            return;
          }
        } else {
          return; // process-local guard active
        }
      }

      const previousTimer = debounceTimers.get(filePath);
      if (previousTimer) clearTimeout(previousTimer);
      debounceTimers.set(filePath, setTimeout(() => {
        debounceTimers.delete(filePath);
        if (watcherPaused) return;
        try {
          const changeSummary = recordRevision(filePath, "human");
          if (!changeSummary) return;
          pi.sendUserMessage(
            `[Worksheet update — ${filename}]\n\nSaved human changes in focused Markdown sections:\n${changeSummary}\n\nThe full document remains at ${filename}; read it if broader context is needed.`,
            { deliverAs: "steer" },
          );
        } catch {
          // raced — file may have been removed
        }
      }, 400));
    };

    const scheduleAllFiles = (): void => {
      try {
        for (const entry of fs.readdirSync(worksheetsAbs)) {
          if (entry.endsWith(".md")) processChange(path.join(worksheetsAbs, entry));
        }
        for (const filePath of attachedFiles) processChange(filePath);
      } catch {
        // directory may have been removed during reload
      }
    };

    const watcher = fs.watch(worksheetsAbs, (_eventType, filename) => {
      const name = filename?.toString();
      if (name?.endsWith(".md")) processChange(path.join(worksheetsAbs, name));
    });

    const watchAttachedFile = (filePath: string): boolean => {
      if (!filePath.endsWith(".md") || !fs.existsSync(filePath)) return false;
      attachedFiles.add(filePath);
      if (!fileWatchers.has(filePath)) {
        fileWatchers.set(filePath, fs.watch(filePath, () => processChange(filePath)));
        try {
          rememberFile(filePath, fs.readFileSync(filePath, "utf-8"));
        } catch {
          // file may have disappeared between existsSync and readFileSync
        }
      }
      return true;
    };

    for (const filePath of attachedFiles) watchAttachedFile(filePath);
    attachWatcher = watchAttachedFile;
    rescanWatcher = scheduleAllFiles;
    closeWatcher = () => {
      watcher.close();
      for (const fileWatcher of fileWatchers.values()) fileWatcher.close();
      fileWatchers.clear();
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
      if (rescanWatcher === scheduleAllFiles) rescanWatcher = null;
      attachWatcher = null;
      closeWatcher = null;
    };

    if (ctx.hasUI) {
      const state = watcherPaused ? "paused" : "watching";
      ctx.ui.notify(`📄 ${state} ${WORKSHEETS_DIR}/`, "info");
    }
  });

  pi.on("session_shutdown", () => {
    closeWatcher?.();
    closeWatcher = null;
    rescanWatcher = null;
    currentConversation = "unknown";
    currentTurn = 0;
  });

  // Track actor context: conversation/turn identity for the audit log.
  pi.on("turn_start", (_event, ctx) => {
    currentTurn += 1;
    if (currentConversation === "unknown") {
      currentConversation = ctx.sessionManager.getSessionFile() ?? "unknown";
    }
  });

  function seedExistingHashes(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        if (entry.endsWith(".md") && fs.statSync(p).isFile()) {
          const content = fs.readFileSync(p, "utf-8");
          rememberFile(p, content);
        }
      }
    } catch {
      // directory doesn't exist yet — fine
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  type WorksheetFile = { name: string; filePath: string; mtime: number };

  function worksheetFiles(): WorksheetFile[] {
    try {
      const dir = path.resolve(WORKSHEETS_DIR);
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => {
          const filePath = path.join(dir, name);
          return { name, filePath, mtime: fs.statSync(filePath).mtimeMs };
        })
        .filter((file) => fs.statSync(file.filePath).isFile())
        .sort((a, b) => b.mtime - a.mtime);
    } catch {
      return [];
    }
  }

  /** Return the path to the most recently modified .worksheets/*.md file, or null. */
  function latestWorksheet(): string | null {
    return worksheetFiles()[0]?.filePath ?? null;
  }

  function requestedWorksheet(name: string): string | null {
    const dir = path.resolve(WORKSHEETS_DIR);
    const candidate = path.resolve(dir, name);
    const relative = path.relative(dir, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !candidate.endsWith(".md")) {
      return null;
    }
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
  }

  /** Turn arbitrary text into a short kebab-case slug. */
  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  /** Local date stamp like `2026-07-27 14:30`. */
  function dateStamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** Build the path for a new worksheet: .worksheets/ws-<epoch>-<slug>.md */
  function worksheetPath(slug: string): string {
    const epoch = Math.floor(Date.now() / 1000);
    return path.resolve(WORKSHEETS_DIR, `ws-${epoch}-${slug}.md`);
  }

  /** Render the standard worksheet template. */
  function worksheetTemplate(title: string, task: string): string {
    return `# ${title} — ${dateStamp()}

## Task
${task}

## Human notes
<!-- Add goals, constraints, feedback, or a requested action here. -->

## Todos
- [ ] Define the next concrete step

## Progress
- Started

## Findings

## Decisions

## Questions / Next steps

`;
  }

  /**
   * Open a worksheet file in a new herdr split running nvim.
   * Fire-and-forget: herdr pane run returns immediately.
   * Falls back to printing instructions if herdr/nvim is unavailable.
   */
  async function openInSplit(
    wsPath: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const rel = path.relative(process.cwd(), wsPath);
    try {
      const { execSync } = await import("node:child_process");
      const out = execSync(
        `herdr pane split --direction right --cwd "${process.cwd()}" --focus`,
        { timeout: 5000, encoding: "utf-8" },
      );
      const parsed = JSON.parse(out) as {
        result?: { pane?: { pane_id?: string } };
      };
      const newPaneId = parsed.result?.pane?.pane_id ?? "";
      if (newPaneId) {
        execSync(`herdr pane run "${newPaneId}" nvim "${wsPath}"`, {
          timeout: 5000,
        });
        ctx.ui.notify(`📄 ${path.basename(wsPath)} opened in split`, "info");
      } else {
        ctx.ui.notify(`📄 ${rel} (open with: nvim "${rel}")`, "info");
      }
    } catch {
      ctx.ui.notify(
        `📄 ${rel}\n  Split: herdr pane split --direction right --focus\n  Then:  nvim "${rel}"`,
        "info",
      );
    }
  }

  // ── commands ────────────────────────────────────────────────────────────

  // Subcommand list shared between autocomplete and the usage hint.
  const SUBCOMMANDS: { value: string; label: string; description: string }[] = [
    { value: "start", label: "start", description: "Create a new worksheet and open it in a split" },
    { value: "attach", label: "attach", description: "Watch an existing Markdown file" },
    { value: "list", label: "list", description: "List project worksheets" },
    { value: "search", label: "search", description: "Search project worksheets" },
    { value: "open", label: "open", description: "Open a worksheet in a split" },
    { value: "path", label: "path", description: "Show a worksheet path" },
    { value: "status", label: "status", description: "Show watcher status and latest worksheet" },
    { value: "pause", label: "pause", description: "Pause the worksheet loop" },
    { value: "resume", label: "resume", description: "Resume and scan for worksheet changes" },
  ];

  pi.registerCommand("worksheet", {
    description: "Control the worksheet loop. Subcommands: start, attach, list, search, open, path, status, pause, resume",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const filtered = SUBCOMMANDS.filter((s) => s.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args: string, ctx) => {
      const [cmd, ...rest] = args.trim().split(/\s+/);
      const sub = (cmd || "").toLowerCase();

      // ── /worksheet start [slug] ────────────────────────────────────────
      // Create a new worksheet from the standard template and open it in a
      // split.  Slug is taken from the args, or prompted for if missing.
      if (sub === "start" || sub === "new" || sub === "create") {
        let slug = rest.join(" ").trim();
        if (!slug) {
          const prompted = await ctx.ui.input(
            "Worksheet slug (kebab-case):",
            "fix-auth",
          );
          if (prompted === undefined) {
            ctx.ui.notify("Cancelled", "info");
            return;
          }
          slug = prompted.trim();
        }
        slug = slugify(slug);
        if (!slug) {
          ctx.ui.notify("Invalid slug — use letters/numbers", "warning");
          return;
        }

        const wsPath = worksheetPath(slug);
        const title = slug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        // The real task comes from the chat conversation; leave a placeholder
        // the agent fills in on its first turn (see SKILL.md).
        const task = "<what the human asked>";

        try {
          fs.mkdirSync(path.resolve(WORKSHEETS_DIR), { recursive: true });
          fs.writeFileSync(wsPath, worksheetTemplate(title, task), "utf-8");
          // Seed the hash so the agent's own create doesn't trigger injection.
          const content = fs.readFileSync(wsPath, "utf-8");
          rememberFile(wsPath, content);
        } catch (err) {
          ctx.ui.notify(`Failed to create worksheet: ${(err as Error).message}`, "error");
          return;
        }

        const rel = path.relative(process.cwd(), wsPath);
        ctx.ui.notify(`📄 Created ${rel}`, "info");
        await openInSplit(wsPath, ctx);
        return;
      }

      // ── /worksheet attach <path> ────────────────────────────────────────
      if (sub === "attach") {
        const target = rest.join(" ").trim();
        if (!target) {
          ctx.ui.notify("Usage: /worksheet attach path/to/document.md", "warning");
          return;
        }
        const filePath = path.resolve(target);
        if (!filePath.endsWith(".md")) {
          ctx.ui.notify("Only Markdown files can be attached", "warning");
          return;
        }
        if (!attachWatcher?.(filePath)) {
          ctx.ui.notify(`Cannot attach missing file: ${target}`, "warning");
          return;
        }
        ctx.ui.notify(`📎 Attached ${path.relative(process.cwd(), filePath)}`, "info");
        return;
      }

      // ── /worksheet list ────────────────────────────────────────────────
      if (sub === "list") {
        const files = worksheetFiles();
        if (files.length === 0) {
          ctx.ui.notify("No worksheets found in .worksheets/", "warning");
          return;
        }
        const listing = files
          .map((file, index) => `  ${index + 1}. ${file.name}`)
          .join("\n");
        ctx.ui.notify(`📚 Worksheets\n${listing}`, "info");
        return;
      }

      // ── /worksheet search <query> ──────────────────────────────────────
      if (sub === "search") {
        const query = rest.join(" ").trim().toLowerCase();
        if (!query) {
          ctx.ui.notify("Usage: /worksheet search <text>", "warning");
          return;
        }
        const matches: string[] = [];
        for (const file of worksheetFiles()) {
          try {
            const lines = fs.readFileSync(file.filePath, "utf-8").split(/\r?\n/);
            lines.forEach((line, lineIndex) => {
              if (line.toLowerCase().includes(query) && matches.length < 40) {
                matches.push(`  ${file.name}:${lineIndex + 1}: ${line.trim()}`);
              }
            });
          } catch {
            // file may have disappeared during the search
          }
        }
        ctx.ui.notify(
          matches.length > 0
            ? `🔎 Worksheets matching “${query}”\n${matches.join("\n")}`
            : `No worksheet matches for “${query}”`,
          matches.length > 0 ? "info" : "warning",
        );
        return;
      }

      // ── /worksheet open|path [name] ────────────────────────────────────
      if (sub === "open" || sub === "path") {
        const requested = rest.join(" ").trim();
        const ws = requested ? requestedWorksheet(requested) : latestWorksheet();
        if (!ws) {
          ctx.ui.notify("Worksheet not found — try /worksheet list or /worksheet start", "warning");
          return;
        }
        const rel = path.relative(process.cwd(), ws);

        if (sub === "path") {
          ctx.ui.notify(`📄 ${rel}`, "info");
          return;
        }

        await openInSplit(ws, ctx);
        return;
      }

      // ── /worksheet pause|off ───────────────────────────────────────────
      if (sub === "off" || sub === "pause") {
        watcherPaused = true;
        ctx.ui.notify("⏸ Worksheet loop paused", "info");
        return;
      }

      // ── /worksheet resume|on ───────────────────────────────────────────
      if (sub === "on" || sub === "resume") {
        watcherPaused = false;
        rescanWatcher?.();
        ctx.ui.notify("▶ Worksheet loop resumed", "info");
        return;
      }

      // ── /worksheet status ──────────────────────────────────────────────
      if (sub === "status") {
        const latest = latestWorksheet();
        const state = watcherPaused ? "paused" : "watching";
        const attached = attachedFiles.size > 0
          ? ` — attached: ${attachedFiles.size}`
          : "";
        const info = latest
          ? `${state} ${path.resolve(WORKSHEETS_DIR)}/ — latest: ${path.basename(latest)}${attached}`
          : `${state} ${path.resolve(WORKSHEETS_DIR)}/ — no worksheets yet${attached}`;
        ctx.ui.notify(info, "info");
        return;
      }

      // ── usage ──────────────────────────────────────────────────────────
      const usage = SUBCOMMANDS.map((s) => `  ${s.value.padEnd(7)} ${s.description}`).join("\n");
      ctx.ui.notify(`Usage: /worksheet {subcommand}\n${usage}`, "info");
    },
  });
}
