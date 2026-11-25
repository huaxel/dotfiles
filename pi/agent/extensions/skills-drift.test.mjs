// Behavioral tests for skills-drift.ts.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { resolve } from "./pi-resolve-hook.mjs";
import { assert, makeCtx, makePiHarness, runTests, tempDir } from "./pi-test-harness.mjs";

registerHooks({ resolve });

const { createSkillsDrift, strayNotice, straySkillEntries } = await import(
  new URL("./skills-drift.ts", import.meta.url)
);

function farm() {
  const { dir, cleanup } = tempDir("skills-drift-");
  const shared = join(dir, ".agents/skills");
  const catalog = join(dir, "catalog");
  mkdirSync(shared, { recursive: true });
  mkdirSync(join(catalog, "code-review"), { recursive: true });
  writeFileSync(join(catalog, "code-review/SKILL.md"), "---\nname: code-review\n---\n");
  symlinkSync(join(catalog, "code-review"), join(shared, "code-review"), "dir");
  return { dir, shared, cleanup };
}

const sharedFarm = farm();

await runTests({
  "a linked catalog is not a stray": async () => {
    const { shared, cleanup } = farm();
    try {
      assert(straySkillEntries(shared).length === 0, "symlinked skill is ignored");
    } finally {
      cleanup();
    }
  },

  "a harness-installed directory is reported": async () => {
    const { shared, cleanup } = farm();
    try {
      mkdirSync(join(shared, "canvas"));
      writeFileSync(join(shared, "canvas/SKILL.md"), "---\nname: canvas\n---\n");
      assert(JSON.stringify(straySkillEntries(shared)) === '["canvas"]', "real directory is a stray");
    } finally {
      cleanup();
    }
  },

  "a harness-installed file is reported and dotfiles are ignored": async () => {
    const { shared, cleanup } = farm();
    try {
      writeFileSync(join(shared, "statusline.md"), "x");
      writeFileSync(join(shared, ".DS_Store"), "x");
      assert(JSON.stringify(straySkillEntries(shared)) === '["statusline.md"]', "file is a stray");
    } finally {
      cleanup();
    }
  },

  "a missing shared root is not an error": async () => {
    const { dir, cleanup } = tempDir("skills-drift-missing-");
    try {
      assert(straySkillEntries(join(dir, "absent")).length === 0, "absent root yields nothing");
    } finally {
      cleanup();
    }
  },

  "the notice names the count and the first entries": async () => {
    const notice = strayNotice(["canvas", "shell", "statusline"]);
    assert(notice.includes("(3)"), "count is shown");
    assert(notice.includes("canvas, shell, statusline"), "names are shown");
    assert(notice.includes("~/.agents/skills"), "location is shown");
  },

  "session start warns once and stays quiet when clean": async () => {
    const { pi, drive } = makePiHarness();
    createSkillsDrift(sharedFarm.shared)(pi);

    const clean = makeCtx();
    await drive("session_start", { reason: "startup" }, clean);
    assert(clean.ui.notifications.length === 0, "no notice for a clean root");

    mkdirSync(join(sharedFarm.shared, "canvas"));
    const dirty = makeCtx();
    await drive("session_start", { reason: "startup" }, dirty);
    assert(dirty.ui.notifications.length === 1, "one notice per session start");
    assert(dirty.ui.notifications[0].type === "warning", "notice is a warning");
    assert(dirty.ui.notifications[0].message.includes("canvas"), "notice names the import");
  },

  "a resume does not repeat the check for a clean root": async () => {
    const own = farm();
    try {
      const { pi, drive } = makePiHarness();
      createSkillsDrift(own.shared)(pi);
      const ctx = makeCtx();
      await drive("session_start", { reason: "resume" }, ctx);
      assert(ctx.ui.notifications.length === 0, "clean root stays quiet on resume");
    } finally {
      own.cleanup();
    }
  },
});

sharedFarm.cleanup();
