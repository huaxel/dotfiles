import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_DIFF_CHARS = 2000;

/**
 * Summarize workspace changes after accept-edits. Returns null when clean or not a git repo.
 * Covers staged and unstaged tracked modifications plus untracked files.
 */
export async function summarizeGitDiff(cwd: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const opts = { cwd, maxBuffer: 64 * 1024, signal };
    const [workingStat, stagedStat, workingNames, stagedNames, status] = await Promise.all([
      execFileAsync("git", ["diff", "--stat"], opts),
      execFileAsync("git", ["diff", "--cached", "--stat"], opts),
      execFileAsync("git", ["diff", "--name-only"], opts),
      execFileAsync("git", ["diff", "--cached", "--name-only"], opts),
      execFileAsync("git", ["status", "--short"], opts),
    ]);
    const unstagedStat = workingStat.stdout.trim();
    const cachedStat = stagedStat.stdout.trim();
    const names = uniqueLines(`${workingNames.stdout}\n${stagedNames.stdout}`);
    const untracked = status.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("??"))
      .map((line) => line.slice(2).trim());
    if (!unstagedStat && !cachedStat && names.length === 0 && untracked.length === 0) return null;

    const sections: string[] = [];
    if (unstagedStat) sections.push("## git diff --stat\n" + unstagedStat);
    if (cachedStat) sections.push("## git diff --cached --stat\n" + cachedStat);
    if (sections.length === 0) sections.push("## git diff --stat\n(no tracked diff)");

    let summary = sections.join("\n\n");
    if (names.length > 0) summary += "\n\n## changed files\n" + names.join("\n");
    if (untracked.length > 0) summary += "\n\n## untracked files\n" + untracked.join("\n");
    if (summary.length > MAX_DIFF_CHARS) {
      summary = summary.slice(0, MAX_DIFF_CHARS) + "\n\n(diff summary truncated)";
    }
    return summary;
  } catch {
    return null;
  }
}

function uniqueLines(value: string): string[] {
  return [...new Set(value.split("\n").map((line) => line.trim()).filter(Boolean))];
}
