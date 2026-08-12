import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_DIFF_CHARS = 2000;

/**
 * Summarize workspace changes after accept-edits. Returns null when clean or not a git repo.
 * Covers tracked modifications (git diff) plus untracked files (git status --short).
 */
export async function summarizeGitDiff(cwd: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const opts = { cwd, maxBuffer: 64 * 1024, signal };
    const { stdout: statOut } = await execFileAsync("git", ["diff", "--stat"], opts);
    const { stdout: namesOut } = await execFileAsync("git", ["diff", "--name-only"], opts);
    const { stdout: statusOut } = await execFileAsync("git", ["status", "--short"], opts);
    const stat = statOut.trim();
    const names = namesOut.trim();
    const untracked = statusOut
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("??"))
      .map((l) => l.slice(2).trim());
    if (!stat && !names && untracked.length === 0) return null;

    let summary = "## git diff --stat\n" + (stat || "(no tracked diff)");
    if (names) summary += "\n\n## changed files\n" + names;
    if (untracked.length > 0) summary += "\n\n## untracked files\n" + untracked.join("\n");
    if (summary.length > MAX_DIFF_CHARS) {
      summary = summary.slice(0, MAX_DIFF_CHARS) + "\n\n(diff summary truncated)";
    }
    return summary;
  } catch {
    return null;
  }
}
