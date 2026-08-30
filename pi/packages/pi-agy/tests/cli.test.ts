import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, stat as statFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const execAsync = promisify(execFile);

import { buildAgyArgs, buildAgyPrompt } from "../extensions/lib/cli.js";
import { resolveAgyMode, truncate } from "../extensions/index.js";
import { registerAgyCommand } from "../extensions/commands.js";
import { executeAgyTask } from "../extensions/lib/execute.js";
import { resetPreflightCache } from "../extensions/lib/preflight.js";
import { withDirLock } from "../extensions/lib/lock.js";
import { detectVerifyCommand } from "../extensions/lib/verify.js";
import { summarizeGitDiff } from "../extensions/lib/postflight.js";
import {
  accumulateRunResult,
  finalizeRunResult,
  formatStepProgress,
  parseStreamLine,
} from "../extensions/lib/stream.js";
import { parseJsonResponse } from "../extensions/lib/parse.js";
import { parseAgyCommandArgs } from "../extensions/commands.js";
import { createSessionStore, getDefaultStorePath } from "../extensions/lib/sessions.js";

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

  it("does not bypass permissions inside the sandbox", () => {
    const args = buildAgyArgs({
      prompt: "preview",
      mode: "sandbox",
      dir: "/tmp",
      timeout_ms: 60_000,
    });
    assert.ok(args.includes("--sandbox"));
    assert.ok(!args.includes("--dangerously-skip-permissions"));
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

  it("prefers a package ci script and package manager", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ packageManager: "pnpm@9", scripts: { ci: "pnpm lint && pnpm test" } }),
    );
    assert.equal(await detectVerifyCommand(tmp), "pnpm run ci");
  });

  it("recognizes uppercase Justfile aliases", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(path.join(tmp, "Justfile"), "alias ci := check\n");
    assert.equal(await detectVerifyCommand(tmp), "just ci");
  });

  it("finds verification commands in a repository ancestor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    const nested = path.join(root, "packages", "app");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, "justfile"), "ci:\n  echo ok\n");
    assert.equal(await detectVerifyCommand(nested), "just ci");
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

  it("ignores non-object JSON lines", () => {
    assert.equal(parseStreamLine("null"), null);
    assert.equal(parseStreamLine("[1, 2, 3]"), null);
    assert.equal(parseStreamLine('"text"'), null);
  });

  it("formats result progress", () => {
    const parsed = parseStreamLine(
      JSON.stringify({
        event: "result",
        result: { status: "SUCCESS", duration_seconds: 1.25 },
      }),
    );
    assert.equal(formatStepProgress(parsed!), "agy: SUCCESS in 1.3s");
  });

  it("preserves metadata from plain JSON output", () => {
    const out = finalizeRunResult(
      JSON.stringify({ conversation_id: "id-2", response: "done", duration_seconds: 2 }),
      { response: "" },
    );
    assert.equal(out.conversation_id, "id-2");
    assert.equal(out.response, "done");
    assert.equal(out.duration_seconds, 2);
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

  it("preserves an explicitly empty successful response", () => {
    const raw =
      JSON.stringify({
        event: "result",
        result: { conversation_id: "id-empty", response: "", status: "SUCCESS" },
      }) + "\n";
    const out = finalizeRunResult(raw, { response: "" });
    assert.equal(out.conversation_id, "id-empty");
    assert.equal(out.response, "");
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

  it("reports staged tracked files", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-diff-"));
    await execAsync("git", ["init", "-q"], { cwd: tmp });
    await execAsync("git", ["config", "user.email", "t@t"], { cwd: tmp });
    await execAsync("git", ["config", "user.name", "t"], { cwd: tmp });
    await writeFile(path.join(tmp, "tracked.txt"), "before\n");
    await execAsync("git", ["add", "tracked.txt"], { cwd: tmp });
    await execAsync("git", ["commit", "-qm", "initial"], { cwd: tmp });
    await writeFile(path.join(tmp, "tracked.txt"), "after\n");
    await execAsync("git", ["add", "tracked.txt"], { cwd: tmp });

    const summary = await summarizeGitDiff(tmp);
    assert.ok(summary);
    assert.match(summary!, /git diff --cached --stat/);
    assert.match(summary!, /tracked\.txt/);
  });

  it("returns null on a clean repo", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-diff-"));
    await execAsync("git", ["init", "-q"], { cwd: tmp });
    assert.equal(await summarizeGitDiff(tmp), null);
  });
});

describe("resolveAgyMode", () => {
  it("defaults direct tool calls to accept-edits", () => {
    assert.equal(resolveAgyMode(), "accept-edits");
    assert.equal(resolveAgyMode("plan"), "plan");
  });
});

describe("shared executor", () => {
  it("runs agy directly and returns progress plus structured details", async () => {
    const raw =
      JSON.stringify({ event: "result", result: { response: "plan complete", status: "SUCCESS" } }) +
      "\n";
    await withFakeAgy(raw, async () => {
      resetPreflightCache();
      const progress: string[] = [];
      const result = await executeAgyTask(
        {
          prompt: "inspect the project",
          model: "flash-low",
          mode: "plan",
          dir: process.cwd(),
          timeout_ms: 60_000,
          new_session: true,
          stream: true,
        },
        undefined,
        (message) => progress.push(message),
      );

      assert.equal(result.text, "plan complete");
      assert.equal(result.details.mode, "plan");
      assert.equal(result.details.model, "flash-low");
      assert.equal(result.details.verify_cmd, null);
      assert.ok(progress.some((message) => message.includes("SUCCESS")));
    });
  });
});

describe("/agy command", () => {
  it("executes directly without sending a second user message", async () => {
    const raw =
      JSON.stringify({ event: "result", result: { response: "direct result", status: "SUCCESS" } }) +
      "\n";
    await withFakeAgy(raw, async () => {
      resetPreflightCache();
      let waitForIdleCalls = 0;
      const statuses: Array<[string, string | undefined]> = [];
      const notifications: Array<[string, string | undefined]> = [];
      let handler: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
      const fakePi = {
        registerCommand: (
          _name: string,
          definition: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
        ) => {
          handler = definition.handler;
        },
      };
      registerAgyCommand(fakePi as unknown as ExtensionAPI);

      await handler!("plan flash inspect files", {
        mode: "tui",
        cwd: process.cwd(),
        signal: undefined,
        waitForIdle: async () => {
          waitForIdleCalls++;
        },
        ui: {
          setStatus: (key: string, text: string | undefined) => statuses.push([key, text]),
          notify: (message: string, type?: "info" | "warning" | "error") =>
            notifications.push([message, type]),
        },
      } as unknown as ExtensionCommandContext);

      assert.equal(waitForIdleCalls, 1);
      assert.ok(statuses.some(([, text]) => text?.includes("starting")));
      assert.deepEqual(statuses.at(-1), ["agy", undefined]);
      assert.ok(notifications.some(([message]) => message.includes("direct result")));
    });
  });
});

describe("truncate", () => {
  it("keeps the ending of long responses", () => {
    const result = truncate("START\n" + "x".repeat(200) + "\nFINAL SUMMARY", 80);
    assert.ok(result.length <= 80);
    assert.match(result, /START/);
    assert.match(result, /FINAL SUMMARY/);
    assert.match(result, /truncated/);
  });
});

describe("parseAgyCommandArgs", () => {
  it("parses model alias + prompt (no mode)", () => {
    const parsed = parseAgyCommandArgs("flash fix git conflicts");
    assert.equal(parsed.model, "flash-medium");
    assert.equal(parsed.mode, undefined);
    assert.equal(parsed.prompt, "fix git conflicts");
  });

  it("parses plan mode + model", () => {
    const parsed = parseAgyCommandArgs("plan sonnet review the diff");
    assert.equal(parsed.model, "sonnet");
    assert.equal(parsed.mode, "plan");
    assert.equal(parsed.prompt, "review the diff");
  });

  it("leaves model/mode unset when only prompt given", () => {
    const parsed = parseAgyCommandArgs("just do the thing");
    assert.equal(parsed.model, undefined);
    assert.equal(parsed.mode, undefined);
    assert.equal(parsed.prompt, "just do the thing");
  });

  it("parses sandbox + full alias", () => {
    const parsed = parseAgyCommandArgs("sandbox pro-high estimate the refactor");
    assert.equal(parsed.model, "pro-high");
    assert.equal(parsed.mode, "sandbox");
    assert.equal(parsed.prompt, "estimate the refactor");
  });

  it("parses explicit accept-edits mode case-insensitively", () => {
    const parsed = parseAgyCommandArgs("ACCEPT-EDITS flash implement the fix");
    assert.equal(parsed.model, "flash-medium");
    assert.equal(parsed.mode, "accept-edits");
    assert.equal(parsed.prompt, "implement the fix");
  });

  it("preserves multiline prompt formatting", () => {
    const parsed = parseAgyCommandArgs("plan flash review these files:\n- one\n- two");
    assert.equal(parsed.prompt, "review these files:\n- one\n- two");
  });

  it("returns empty object for bare /agy", () => {
    const parsed = parseAgyCommandArgs("");
    assert.deepEqual(parsed, {});
  });
});

describe("parseJsonResponse", () => {
  it("extracts response field", () => {
    assert.equal(parseJsonResponse(JSON.stringify({ response: "hello" })), "hello");
  });

  it("falls back when response is not text", () => {
    const raw = JSON.stringify({ response: { text: "hello" } });
    assert.equal(parseJsonResponse(raw), raw);
  });
});

describe("session store", () => {
  it("uses PI_CODING_AGENT_DIR for the default store path", () => {
    const previous = process.env.PI_CODING_AGENT_DIR;
    try {
      process.env.PI_CODING_AGENT_DIR = "/tmp/pi-agy-custom-agent";
      assert.equal(
        getDefaultStorePath(),
        path.join("/tmp/pi-agy-custom-agent", "agy-sessions.json"),
      );
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  });

  it("serializes concurrent updates and writes a private file", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-sessions-"));
    const store = createSessionStore(path.join(tmp, "agy-sessions.json"));

    await Promise.all([
      store.saveSession("/project-a", "conversation-a", "flash-medium"),
      store.saveSession("/project-b", "conversation-b", "sonnet"),
    ]);

    assert.equal((await store.getSession("/project-a"))?.last_conversation_id, "conversation-a");
    assert.equal((await store.getSession("/project-b"))?.last_conversation_id, "conversation-b");
    const mode = (await statFile(path.join(tmp, "agy-sessions.json"))).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

async function withFakeAgy<T>(output: string, fn: () => Promise<T>): Promise<T> {
  const bin = await mkdtemp(path.join(os.tmpdir(), "pi-agy-bin-"));
  const encoded = Buffer.from(output).toString("base64");
  await writeFile(
    path.join(bin, "agy"),
    `#!/usr/bin/env bash
set -eu
case "$1" in
  --version) echo "agy fake" ;;
  models) echo "fake-model" ;;
  *)
    printf '%s\\n' '{"event":"init","init":{"model":"fake"}}'
    printf '%s' '${encoded}' | base64 --decode
    ;;
esac
`,
  );
  await chmod(path.join(bin, "agy"), 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ""}`;
  try {
    return await fn();
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    resetPreflightCache();
  }
}

describe("withDirLock", () => {
  it("allows a queued call to cancel without blocking later work", async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const running = withDirLock("cancel-test", async () => {
      firstStarted();
      await first;
    });
    await started;

    const controller = new AbortController();
    const cancelled = withDirLock("cancel-test", async () => {}, controller.signal);
    controller.abort();
    await assert.rejects(cancelled, /cancelled while waiting/);

    releaseFirst();
    await running;
    await withDirLock("cancel-test", async () => {});
  });
});
