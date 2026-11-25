import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lstatSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_SHARED_ROOT = join(homedir(), ".agents", "skills");

/**
 * Names installed into the shared skills root instead of linked to the catalog.
 *
 * `~/.agents/skills` holds one symlink per catalog skill. The catalog never
 * contributes a real directory or file, so anything else there was installed by
 * a harness that re-seeds its built-in skills on startup. Those copies sit
 * outside Git, which is the point of the layout, but they are still discovered
 * by every agent, so they need to be reported rather than silently paid for.
 */
export function straySkillEntries(sharedRoot: string = DEFAULT_SHARED_ROOT): string[] {
  let entries: string[];
  try {
    entries = readdirSync(sharedRoot);
  } catch {
    return [];
  }
  return entries
    .filter((name) => !name.startsWith("."))
    .filter((name) => {
      try {
        return !lstatSync(join(sharedRoot, name)).isSymbolicLink();
      } catch {
        return false;
      }
    })
    .sort();
}

export function strayNotice(strays: readonly string[]): string {
  const shown = strays.slice(0, 6).join(", ") + (strays.length > 6 ? ", …" : "");
  return (
    `Skills installed into ~/.agents/skills (${strays.length}): ${shown}. ` +
    "The catalog only links skills there, so a harness installed these. " +
    "They are outside Git; delete them unless you meant to keep one."
  );
}

export function createSkillsDrift(sharedRoot: string = DEFAULT_SHARED_ROOT) {
  return (pi: ExtensionAPI): void => {
    pi.on("session_start", (_event, ctx) => {
      const strays = straySkillEntries(sharedRoot);
      if (strays.length === 0) return;
      ctx.ui.notify(strayNotice(strays), "warning");
    });
  };
}

export default createSkillsDrift();
