import { access, readFile } from "node:fs/promises";
import * as path from "node:path";

interface PackageJson {
  packageManager?: unknown;
  scripts?: Record<string, unknown>;
}

/** Detect a local verification command for accept-edits verify-loop injection. */
export async function detectVerifyCommand(cwd: string): Promise<string | null> {
  if (await hasJustCi(cwd)) return "just ci";

  try {
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as PackageJson;
    const scripts = pkg.scripts ?? {};
    const runner = await detectPackageRunner(cwd, pkg.packageManager);
    if (typeof scripts.ci === "string" && scripts.ci.trim()) return runScript(runner, "ci");
    if (typeof scripts.test === "string" && scripts.test.trim()) return runScript(runner, "test");
  } catch {
    // no package.json or unreadable package metadata
  }

  return null;
}

async function hasJustCi(cwd: string): Promise<boolean> {
  for (const filename of ["justfile", "Justfile"]) {
    try {
      const justfile = await readFile(path.join(cwd, filename), "utf8");
      if (justfile.split("\n").some((line) => /^(?:alias\s+)?ci\s*(?::|:=)/.test(line))) {
        return true;
      }
    } catch {
      // try the next Justfile spelling
    }
  }
  return false;
}

async function detectPackageRunner(cwd: string, declared: unknown): Promise<string> {
  if (typeof declared === "string") {
    const runner = declared.split("@", 1)[0];
    if (["npm", "pnpm", "yarn", "bun"].includes(runner)) return runner;
  }

  for (const [filename, runner] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ] as const) {
    if (await fileExists(path.join(cwd, filename))) return runner;
  }
  return "npm";
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function runScript(runner: string, script: string): string {
  return runner === "npm" && script === "test" ? "npm test" : `${runner} run ${script}`;
}
