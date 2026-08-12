import { readFile } from "node:fs/promises";
import * as path from "node:path";

/** Detect a local verification command for accept-edits verify-loop injection. */
export async function detectVerifyCommand(cwd: string): Promise<string | null> {
  if (await hasJustCi(cwd)) return "just ci";

  try {
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
    if (pkg?.scripts?.test) return "npm test";
  } catch {
    // no package.json
  }

  return null;
}

async function hasJustCi(cwd: string): Promise<boolean> {
  try {
    const justfile = await readFile(path.join(cwd, "justfile"), "utf8");
    return justfile.split("\n").some((line) => /^ci\s*:/.test(line));
  } catch {
    return false;
  }
}
