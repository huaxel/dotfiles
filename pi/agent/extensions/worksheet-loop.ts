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

  // ── loop guard ──────────────────────────────────────────────────────────

  /** Stored hashes per file — exact + whitespace-normalized. */
  const fileState = new Map<string, { exact: string; norm: string }>();

  function fileHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /** Hash of the content with all whitespace collapsed (ignores formatting-only changes). */
  function normalizedHash(content: string): string {
    return crypto.createHash("sha256")
      .update(content.replace(/\s+/g, " ").trim())
      .digest("hex");
  }

  function isWorksheetPath(absPath: string): boolean {
    const parts = absPath.replace(/\/$/, "").split(path.sep);
    return parts.includes(WORKSHEETS_DIR) && absPath.endsWith(".md");
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

  pi.on("tool_call", async (event) => {
    if (!event.toolName || !["write", "edit"].includes(event.toolName)) return;
    const args = (event.input ?? {}) as Record<string, unknown>;
    const targetPath = (args.path ?? args.file ?? "") as string;
    if (targetPath && isWorksheetPath(path.resolve(targetPath))) {
      armedPaths.set(event.toolCallId, path.resolve(targetPath));
      worksheetGuard.arm(targetPath);
    }
  });

  pi.on("tool_execution_end", async (event) => {
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

  pi.on("before_agent_start", async (event) => {
    const instructions = loadSkillContent();
    if (instructions) {
      event.systemPrompt += `\n\n${instructions}`;
    }
  });

  // ── watch .worksheets/ for human edits ──────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const worksheetsAbs = path.resolve(WORKSHEETS_DIR);

    // Seed hashes for any existing files so we don't re-inject them
    seedExistingHashes(worksheetsAbs);

    // Ensure the directory exists so fs.watch has something to latch onto
    if (!fs.existsSync(worksheetsAbs)) {
      fs.mkdirSync(worksheetsAbs, { recursive: true });
    }

    // Watch the .worksheets/ directory
    let debounce: ReturnType<typeof setTimeout> | null = null;
    fs.watch(worksheetsAbs, (_eventType, filename) => {
      if (!filename || !filename.endsWith(".md")) return;

      // Guarded: an agent (this process or another) is writing.  Skip
      // injection, BUT still update the stored hash so that any later
      // spurious fs.watch event (after the guard drops) matches the new
      // content instead of re-injecting the agent's own write.
      if (worksheetGuard.active || fs.existsSync(SENTINEL)) {
        if (fs.existsSync(SENTINEL)) {
          try {
            const age = Date.now() - fs.statSync(SENTINEL).mtimeMs;
            if (age >= 30_000) {
              fs.unlinkSync(SENTINEL); // stale lock from a crashed process
            } else {
              // Live guard — refresh our hash for this file and bail.
              const filePath = path.join(worksheetsAbs, filename);
              try {
                const content = fs.readFileSync(filePath, "utf-8");
                if (content.trim()) {
                  fileState.set(filePath, {
                    exact: fileHash(content),
                    norm: normalizedHash(content),
                  });
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

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const filePath = path.join(worksheetsAbs, filename);
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
            fileState.set(filePath, { exact, norm });
            return;
          }

          fileState.set(filePath, { exact, norm });

          pi.sendUserMessage(
            `[Worksheet update — ${filename}]\n\n${content}`,
            { deliverAs: "steer" },
          );
        } catch {
          // raced — file may have been removed
        }
      }, 400);
    });

    if (ctx.hasUI) {
      ctx.ui.notify(`📄 Watching ${WORKSHEETS_DIR}/`, "info");
    }
  });

  function seedExistingHashes(dir: string): void {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        if (entry.endsWith(".md") && fs.statSync(p).isFile()) {
          const content = fs.readFileSync(p, "utf-8");
          fileState.set(p, {
            exact: fileHash(content),
            norm: normalizedHash(content),
          });
        }
      }
    } catch {
      // directory doesn't exist yet — fine
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Return the path to the most recently modified .worksheets/*.md file, or null. */
  function latestWorksheet(): string | null {
    try {
      const dir = path.resolve(WORKSHEETS_DIR);
      if (!fs.existsSync(dir)) return null;
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      return files.length > 0 ? path.join(dir, files[0].name) : null;
    } catch {
      return null;
    }
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

## Progress
- Started

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
    { value: "open", label: "open", description: "Open the latest worksheet in a split" },
    { value: "path", label: "path", description: "Show the latest worksheet path" },
    { value: "status", label: "status", description: "Show watcher status and latest worksheet" },
    { value: "pause", label: "pause", description: "Pause the worksheet loop (reload to resume)" },
  ];

  pi.registerCommand("worksheet", {
    description: "Control the worksheet loop. Subcommands: start, open, path, status, pause",
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
          fileState.set(wsPath, {
            exact: fileHash(content),
            norm: normalizedHash(content),
          });
        } catch (err) {
          ctx.ui.notify(`Failed to create worksheet: ${(err as Error).message}`, "error");
          return;
        }

        const rel = path.relative(process.cwd(), wsPath);
        ctx.ui.notify(`📄 Created ${rel}`, "info");
        await openInSplit(wsPath, ctx);
        return;
      }

      // ── /worksheet open|path ───────────────────────────────────────────
      if (sub === "open" || sub === "path") {
        const ws = latestWorksheet();
        if (!ws) {
          ctx.ui.notify("No worksheet found in .worksheets/ — try /worksheet start", "warning");
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
        ctx.ui.notify("⏸ Worksheet loop paused (reload to resume)", "info");
        return;
      }

      // ── /worksheet status ──────────────────────────────────────────────
      if (sub === "status") {
        const latest = latestWorksheet();
        const info = latest
          ? `Watching ${path.resolve(WORKSHEETS_DIR)}/ — latest: ${path.basename(latest)}`
          : `Watching ${path.resolve(WORKSHEETS_DIR)}/ — no worksheets yet`;
        ctx.ui.notify(info, "info");
        return;
      }

      // ── usage ──────────────────────────────────────────────────────────
      const usage = SUBCOMMANDS.map((s) => `  ${s.value.padEnd(7)} ${s.description}`).join("\n");
      ctx.ui.notify(`Usage: /worksheet {subcommand}\n${usage}`, "info");
    },
  });
}
