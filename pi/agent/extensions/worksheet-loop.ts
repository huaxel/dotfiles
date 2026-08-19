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
          if (!fs.existsSync(filePath)) return;
          const content = fs.readFileSync(filePath, "utf-8");
          if (!content.trim()) return;

          const exact = fileHash(content);
          const norm = normalizedHash(content);
          const prev = fileState.get(filePath);

          // No change at all
          if (prev && prev.exact === exact) return;

          // Only whitespace/formatting changed — update hash, don't inject
          if (prev && prev.norm === norm) {
            rememberFile(filePath, content);
            return;
          }

          const changeSummary = summarizeChange(prev?.content, content);
          rememberFile(filePath, content);
          pi.sendUserMessage(
            `[Worksheet update — ${filename}]\n\nChanges since the last state:\n${changeSummary}\n\nCurrent document:\n${content}`,
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
