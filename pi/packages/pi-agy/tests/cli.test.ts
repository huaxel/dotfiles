import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, stat as statFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const execAsync = promisify(execFile);

import {
  buildAgyArgs,
  buildAgyPrompt,
  isAgyModel,
  isTransientAgyFailure,
  parseModelCatalog,
  resetModelCatalog,
  resolveAgyModelId,
  updateModelCatalog,
} from "../extensions/lib/cli.js";
import { resolveAgyMode, truncate } from "../extensions/index.js";
import { registerAgyCommand } from "../extensions/commands.js";
import { executeAgyTask } from "../extensions/lib/execute.js";
import { resetPreflightCache } from "../extensions/lib/preflight.js";
import { withDirLock } from "../extensions/lib/lock.js";
import { detectVerifyCommand } from "../extensions/lib/verify.js";
import { summarizeGitDiff } from "../extensions/lib/postflight.js";
import { loadAgyConfig } from "../extensions/lib/config.js";
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

  it("disables slash command expansion in print mode", () => {
    const args = buildAgyArgs({
      prompt: "/review everything",
      mode: "plan",
      dir: "/tmp",
      timeout_ms: 60_000,
    });
    assert.ok(args.includes("--disable-slash-commands"));
  });

  it("passes reasoning effort", () => {
    const args = buildAgyArgs({
      prompt: "t",
      mode: "plan",
      dir: "/tmp",
      timeout_ms: 60_000,
      effort: "high",
    });
    const idx = args.indexOf("--effort");
    assert.equal(args[idx + 1], "high");
  });

  it("can run accept-edits without bypassing permissions", () => {
    const args = buildAgyArgs({
      prompt: "t",
      dir: "/tmp",
      timeout_ms: 60_000,
      skipPermissions: false,
    });
    assert.ok(!args.includes("--dangerously-skip-permissions"));
  });
});

describe("model catalog", () => {
  it("maps aliases to the newest catalog generation", () => {
    const catalog = parseModelCatalog(
      [
        "Fetching available models...",
        "gemini-3.6-flash-medium\tGemini 3.6 Flash (Medium)",
        "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)",
        "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)",
        "gemini-3.1-pro-high\tGemini 3.1 Pro (High)",
        "claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)",
      ].join("\n"),
    );
    assert.equal(catalog["flash-medium"], "gemini-3.8-flash-medium");
    assert.equal(catalog["flash-low"], "gemini-3.8-flash-low");
    assert.equal(catalog["pro-high"], "gemini-3.1-pro-high");
    assert.equal(catalog.sonnet, "claude-sonnet-4-6");
    assert.equal(catalog.opus, undefined);
  });

  it("prefers live catalog entries when building args", () => {
    resetModelCatalog();
    updateModelCatalog({ "flash-low": "gemini-9.1-flash-low" });
    try {
      const args = buildAgyArgs({
        prompt: "t",
        model: "flash-low",
        dir: "/tmp",
        timeout_ms: 60_000,
      });
      assert.ok(args.includes("gemini-9.1-flash-low"));
    } finally {
      resetModelCatalog();
    }
  });

  it("falls back to the static map without a catalog", () => {
    resetModelCatalog();
    assert.equal(resolveAgyModelId("flash-medium"), "gemini-3.8-flash-medium");
    assert.equal(resolveAgyModelId(undefined, "flash"), "gemini-3.8-flash-high");
  });

  it("accepts only known model aliases", () => {
    assert.ok(isAgyModel("sonnet"));
    assert.ok(!isAgyModel("gpt-4"));
    assert.ok(!isAgyModel(undefined));
  });
});

describe("isTransientAgyFailure", () => {
  it("classifies rate limits and network blips as transient", () => {
    assert.ok(isTransientAgyFailure("agy exited with code 1:\nrate limit exceeded"));
    assert.ok(isTransientAgyFailure("503 overloaded, try again"));
    assert.ok(isTransientAgyFailure("fetch failed: socket hang up"));
  });

  it("does not classify cancellations or hard errors as transient", () => {
    assert.ok(!isTransientAgyFailure("agy was cancelled (timeout)"));
    assert.ok(!isTransientAgyFailure("agy exited with code 2:\nunknown flag"));
    assert.ok(!isTransientAgyFailure("Antigravity CLI not found in PATH."));
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

  it("recognizes hidden .justfile", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(path.join(tmp, ".justfile"), "ci:\n  echo ok\n");
    assert.equal(await detectVerifyCommand(tmp), "just ci");
  });

  it("stops at the repository boundary", async () => {
    const outer = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(path.join(outer, "justfile"), "ci:\n  echo ok\n");
    const repo = path.join(outer, "repo");
    await mkdir(repo, { recursive: true });
    await execAsync("git", ["init", "-q"], { cwd: repo });
    const nested = path.join(repo, "packages", "app");
    await mkdir(nested, { recursive: true });
    assert.equal(await detectVerifyCommand(nested), null);
  });

  it("falls back to npm test when just is not installed", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(path.join(tmp, "justfile"), "ci:\n  echo ok\n");
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ scripts: { test: "node --test" } }),
    );
    assert.equal(
      await detectVerifyCommand(tmp, { justAvailable: async () => false }),
      "npm test",
    );
  });

  it("detects uv run pytest for Python projects", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-verify-"));
    await writeFile(
      path.join(tmp, "pyproject.toml"),
      "[project]\nname = 'x'\n[dependency-groups]\ndev = ['pytest']\n",
    );
    await writeFile(path.join(tmp, "uv.lock"), "");
    assert.equal(await detectVerifyCommand(tmp), "uv run pytest");
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

  it("retries once after a transient failure before any work", async () => {
    const raw =
      JSON.stringify({ event: "result", result: { response: "recovered", status: "SUCCESS" } }) +
      "\n";
    await withFakeAgy(
      raw,
      async () => {
        resetPreflightCache();
        const progress: string[] = [];
        const result = await executeAgyTask(
          {
            prompt: "inspect the project",
            mode: "plan",
            dir: process.cwd(),
            timeout_ms: 60_000,
            new_session: true,
            stream: true,
          },
          undefined,
          (message) => progress.push(message),
        );

        assert.equal(result.text, "recovered");
        assert.ok(progress.some((message) => message.includes("retrying")));
      },
      1,
    );
  });

  it("passes effort and disables slash expansion end to end", async () => {
    const raw =
      JSON.stringify({ event: "result", result: { response: "done", status: "SUCCESS" } }) + "\n";
    await withFakeAgy(raw, async (bin) => {
      resetPreflightCache();
      await executeAgyTask(
        {
          prompt: "/review then implement",
          model: "sonnet",
          effort: "high",
          mode: "plan",
          dir: process.cwd(),
          timeout_ms: 60_000,
          new_session: true,
          stream: true,
        },
        undefined,
      );

      const args = await readFakeAgyArgs(bin);
      assert.ok(args.some((a) => a.includes("--effort") && a.includes("high")));
      assert.ok(args.some((a) => a.includes("--disable-slash-commands")));
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

  it("resumes a recorded conversation via /agy sessions", async () => {
    const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-agy-agentdir-"));
    const cwd = process.cwd();
    await writeFile(
      path.join(agentDir, "agy-sessions.json"),
      JSON.stringify({
        [cwd]: {
          history: [
            {
              conversation_id: "conv-1111",
              model: "flash-medium",
              updated_at: new Date().toISOString(),
            },
          ],
        },
      }),
    );

    const raw =
      JSON.stringify({ event: "result", result: { response: "resumed", status: "SUCCESS" } }) +
      "\n";
    await withFakeAgy(raw, async (bin) => {
      resetPreflightCache();
      const previousDir = process.env.PI_CODING_AGENT_DIR;
      process.env.PI_CODING_AGENT_DIR = agentDir;
      try {
        let handler:
          | ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
          | undefined;
        const fakePi = {
          registerCommand: (
            _name: string,
            definition: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
          ) => {
            handler = definition.handler;
          },
        };
        registerAgyCommand(fakePi as unknown as ExtensionAPI);

        const selections: string[] = [];
        const notifications: Array<[string, string | undefined]> = [];
        await handler!("sessions", {
          mode: "tui",
          cwd,
          signal: undefined,
          waitForIdle: async () => {},
          ui: {
            select: async (_title: string, options: string[]) => {
              const pick = options[0];
              selections.push(pick);
              return pick;
            },
            editor: async () => "continue the refactor",
            confirm: async () => true,
            setStatus: () => {},
            notify: (message: string, type?: "info" | "warning" | "error") =>
              notifications.push([message, type]),
          },
        } as unknown as ExtensionCommandContext);

        assert.deepEqual(selections, [
          "1. flash-medium · just now · conv-111…",
          "accept-edits — writes files (default)",
        ]);
        const args = await readFakeAgyArgs(bin);
        assert.ok(args.some((a) => a.includes("--conversation") && a.includes("conv-1111")));
        assert.ok(notifications.some(([message]) => message.includes("resumed")));
      } finally {
        if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = previousDir;
      }
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

  it("parses continue and timeout tokens", () => {
    const parsed = parseAgyCommandArgs("continue timeout=10m fix the failing tests");
    assert.equal(parsed.continue, true);
    assert.equal(parsed.timeout_ms, 600_000);
    assert.equal(parsed.prompt, "fix the failing tests");
  });

  it("parses timeout in seconds, milliseconds, and bare minutes", () => {
    assert.equal(parseAgyCommandArgs("timeout=90s do it").timeout_ms, 90_000);
    assert.equal(parseAgyCommandArgs("timeout=8 do it").timeout_ms, 480_000);
    assert.equal(parseAgyCommandArgs("timeout=1500ms do it").timeout_ms, 1_500);
  });

  it("does not swallow continue inside the prompt body", () => {
    const parsed = parseAgyCommandArgs("plan review, then continue");
    assert.equal(parsed.continue, undefined);
    assert.equal(parsed.prompt, "review, then continue");
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

describe("agy config", () => {
  it("reads optional overrides from the agent config", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-config-"));
    const file = path.join(tmp, "agy-config.json");
    await writeFile(file, JSON.stringify({ skipPermissions: false, defaultModel: "sonnet" }));
    const config = await loadAgyConfig(file);
    assert.equal(config.skipPermissions, false);
    assert.equal(config.defaultModel, "sonnet");
  });

  it("returns defaults for missing or malformed config", async () => {
    assert.deepEqual(await loadAgyConfig(path.join(os.tmpdir(), "missing-agy-config.json")), {});
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-config-"));
    const file = path.join(tmp, "agy-config.json");
    await writeFile(file, "not json");
    assert.deepEqual(await loadAgyConfig(file), {});
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

  it("keeps a capped, most-recent-first history per directory", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-agy-sessions-"));
    const store = createSessionStore(path.join(tmp, "agy-sessions.json"));

    await store.saveSession("/p", "c1", "flash-medium");
    await store.saveSession("/p", "c2", "sonnet");
    await store.saveSession("/p", "c1", "flash-low");

    const history = await store.getHistory("/p");
    assert.deepEqual(
      history.map((entry) => entry.conversation_id),
      ["c1", "c2"],
    );
    assert.equal(history[0].model, "flash-low");

    for (let i = 0; i < 12; i++) await store.saveSession("/p", `extra-${i}`);
    assert.equal((await store.getHistory("/p")).length, 10);
  });
});

async function withFakeAgy<T>(
  output: string,
  fn: (bin: string) => Promise<T>,
  failures = 0,
): Promise<T> {
  const bin = await mkdtemp(path.join(os.tmpdir(), "pi-agy-bin-"));
  const encoded = Buffer.from(output).toString("base64");
  await writeFile(
    path.join(bin, "agy"),
    `#!/usr/bin/env bash
set -eu
dir="$(cd "$(dirname "$0")" && pwd)"
count_file="$dir/invocations"
n=$(cat "$count_file" 2>/dev/null || echo 0)
echo $((n + 1)) > "$count_file"
printf '%s\\n' "$@" > "$dir/args-$n"
case "$1" in
  --version) echo "agy fake" ;;
  models) echo "fake-model" ;;
  *)
    print_count_file="$dir/print-invocations"
    p=$(cat "$print_count_file" 2>/dev/null || echo 0)
    echo $((p + 1)) > "$print_count_file"
    if [ "$p" -lt ${failures} ]; then
      echo "rate limit exceeded, retry later" >&2
      exit 1
    fi
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
    return await fn(bin);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    resetPreflightCache();
  }
}

/** Read the argv recordings left by the fake agy binary, in invocation order. */
async function readFakeAgyArgs(bin: string): Promise<string[]> {
  const files = (await readdir(bin)).filter((name) => name.startsWith("args-")).sort();
  return Promise.all(files.map((name) => readFile(path.join(bin, name), "utf8")));
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

  it("times out while waiting for a previous run", async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const running = withDirLock("deadline-test", async () => {
      firstStarted();
      await first;
    });
    await started;

    await assert.rejects(
      withDirLock("deadline-test", async () => "never", undefined, 50),
      /timed out waiting/,
    );

    releaseFirst();
    await running;
    assert.equal(await withDirLock("deadline-test", async () => "ok"), "ok");
  });
});
