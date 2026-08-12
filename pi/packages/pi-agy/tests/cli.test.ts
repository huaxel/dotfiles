import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execAsync = promisify(execFile);

import { buildAgyArgs, buildAgyPrompt } from "../extensions/lib/cli.js";
import { detectVerifyCommand } from "../extensions/lib/verify.js";
import { summarizeGitDiff } from "../extensions/lib/postflight.js";
import {
  accumulateRunResult,
  formatStepProgress,
  parseStreamLine,
} from "../extensions/lib/stream.js";
import { parseJsonResponse } from "../extensions/lib/parse.js";

describe("buildAgyArgs", () => {
  it("uses stream-json for plan mode", () => {
    const args = buildAgyArgs({
      prompt: "test",
      mode: "plan",
      dir: "/tmp",
      timeout_ms: 60_000,
      stream: true,
    });
    assert.ok(args.includes("--output-format"));
    assert.ok(args.includes("stream-json"));
  });

  it("passes conversation id", () => {
    const args = buildAgyArgs({
      prompt: "test",
      dir: "/tmp",
      timeout_ms: 60_000,
      conversation_id: "abc-123",
    });
    const idx = args.indexOf("--conversation");
    assert.equal(args[idx + 1], "abc-123");
  });

  it("passes continue flag", () => {
    const args = buildAgyArgs({
      prompt: "test",
      dir: "/tmp",
      timeout_ms: 60_000,
      continue: true,
    });
    assert.ok(args.includes("--continue"));
  });
});

describe("buildAgyPrompt", () => {
  it("injects verify command for accept-edits", () => {
    const p = buildAgyPrompt("do X", "accept-edits", false, "just ci");
    assert.match(p, /just ci/);
  });
});

describe("detectVerifyCommand", () => {
  it("prefers just ci when justfile has ci recipe", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(path.join(tmp, "justfile"), "ci:\n  echo ok\n");
    assert.equal(await detectVerifyCommand(tmp), "just ci");
  });

  it("falls back to npm test", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ scripts: { test: "node --test" } }),
    );
    assert.equal(await detectVerifyCommand(tmp), "npm test");
  });
});

describe("stream parser", () => {
  it("formats tool progress", () => {
    const parsed = parseStreamLine(
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_type: "tool",
          state: "ACTIVE",
          tool_name: "write_to_file",
          tool_info: { parameters: { TargetFile: "/tmp/a.ts" } },
        },
      }),
    );
    assert.ok(parsed);
    assert.equal(formatStepProgress(parsed!), "▸ write_to_file → /tmp/a.ts");
  });

  it("accumulates result conversation id", () => {
    const line = parseStreamLine(
      JSON.stringify({
        event: "result",
        result: {
          conversation_id: "id-1",
          response: "done",
          status: "SUCCESS",
        },
      }),
    );
    const out = accumulateRunResult(line!, { response: "" });
    assert.equal(out.conversation_id, "id-1");
    assert.equal(out.response, "done");
  });
});

describe("summarizeGitDiff", () => {
  it("reports untracked files", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-diff-"));
    await execAsync("git", ["init", "-q"], { cwd: tmp });
    await execAsync("git", ["config", "user.email", "t@t"], { cwd: tmp });
    await execAsync("git", ["config", "user.name", "t"], { cwd: tmp });
    await writeFile(path.join(tmp, "new.txt"), "hello");
    const summary = await summarizeGitDiff(tmp);
    assert.ok(summary);
    assert.match(summary!, /untracked files/);
    assert.match(summary!, /new\.txt/);
  });

  it("returns null on a clean repo", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-diff-"));
    await execAsync("git", ["init", "-q"], { cwd: tmp });
    assert.equal(await summarizeGitDiff(tmp), null);
  });
});

describe("parseJsonResponse", () => {
  it("extracts response field", () => {
    assert.equal(parseJsonResponse(JSON.stringify({ response: "hello" })), "hello");
  });
});
