// Exercise the installed ask_user tool and Pi's UI/status code without starting Pi or a model.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "./pi-resolve-hook.mjs";

registerHooks({ resolve });
// Never contact a real Herdr pane from this isolated UI fixture.
delete process.env.HERDR_ENV;
delete process.env.HERDR_SOCKET_PATH;
delete process.env.HERDR_PANE_ID;
const { discoverAndLoadExtensions } = await import("@earendil-works/pi-coding-agent");
const { formatProgramStatus } = await import("@earendil-works/pi-tui");
const sdk = import.meta.resolve("@earendil-works/pi-coding-agent");
const { InteractiveMode } = await import(new URL("./modes/interactive/interactive-mode.js", sdk));
const { ProgramStatusReporter } = await import(new URL("./modes/interactive/program-status-reporter.js", sdk));
const directory = mkdtempSync(path.join(tmpdir(), "pi-question-notifications-"));
const packageFile = fileURLToPath(new URL("../npm/node_modules/@juanbenjumea/pi-ask-herdr/index.ts", import.meta.url));

try {
  const loaded = await discoverAndLoadExtensions([packageFile], directory, directory);
  assert.deepEqual(loaded.errors, [], "ask_user must load cleanly");
  const tool = loaded.extensions.find((extension) => extension.tools.has("ask_user"))?.tools.get("ask_user").definition;
  assert.ok(tool, "installed ask_user tool is required");

  function fixture(emit = false) {
    const reports = [];
    const terminal = { setProgramStatus(status) {
      reports.push(status);
      if (emit) process.stdout.write(formatProgramStatus(status));
    } };
    const reporter = new ProgramStatusReporter(() => terminal, () => "Notification check");
    reporter.handleEvent({ type: "agent_start" });
    // Use the real custom-dialog stack and status cleanup, not a mock of blocked handling.
    const mode = Object.assign(Object.create(InteractiveMode.prototype), {
      editor: { getText: () => "draft", setText() {} },
      editorContainer: { clear() {}, addChild() {} },
      extensionDialogs: [],
      keybindings: { matches: () => false },
      ui: { requestRender() {}, setFocus() {} },
      disposeActiveSelector() {},
      programStatus: reporter,
    });
    const ctx = { mode: "tui", hasUI: true, ui: { custom: (factory, options) => mode.showExtensionCustom(factory, options) } };
    const ask = (params, signal) => tool.execute("question-fixture", params, signal, () => {}, ctx);
    return { mode, reports, ask };
  }
  const open = async (f, params, signal) => {
    const pending = f.ask(params, signal);
    await delay(0); // The real custom UI attaches its component in a microtask.
    assert.equal(f.mode.extensionDialogs.length, 1);
    return { pending };
  };
  const blocked = (f) => {
    assert.equal(f.reports.at(-1).state, "blocked", "unanswered ask_user must not remain working");
    assert.equal(f.reports.at(-1).kind, "question");
    assert.ok(!f.reports.at(-1).message.includes("PRIVATE"), "notification must not disclose question contents");
  };
  const answer = (f, text) => {
    const component = f.mode.extensionDialogs.at(-1).component;
    component.handleInput(text);
    component.handleInput("\r");
  };
  const cleared = (f) => {
    assert.equal(f.mode.extensionDialogs.length, 0);
    assert.equal(f.reports.at(-1).state, "working", "answer/cancel must restore normal activity");
    assert.equal(f.reports.at(-1).kind, undefined);
  };

  if (process.argv.includes("--rex-smoke")) {
    const f = fixture(true);
    const { pending } = await open(f, { questions: [{ question: "Disposable notification check", type: "text" }] });
    blocked(f);
    await delay(12000);
    answer(f, "verified");
    await pending;
    cleared(f);
    console.log("Question status verified and cleared");
    await delay(3000); // Leave the cleared record observable before Rex closes this command block.
  } else {
    {
      const f = fixture();
      const { pending } = await open(f, { questions: [{ question: "PRIVATE question\nwith controls", type: "text" }] });
      blocked(f);
      answer(f, "answer");
      const result = await pending;
      assert.equal(result.details.answers[0].answer, "answer");
      cleared(f);
      console.log("ok: real question UI reports blocked and clears after answering");
    }
    {
      const f = fixture();
      const controller = new AbortController();
      const { pending } = await open(f, { questions: [{ question: "PRIVATE cancel", type: "text" }] }, controller.signal);
      blocked(f);
      controller.abort();
      assert.equal((await pending).details.cancelled, true);
      cleared(f);
      console.log("ok: cancellation clears blocked status");
    }
    {
      const f = fixture();
      const { pending } = await open(f, { questions: [{ question: "PRIVATE timeout", type: "text" }], timeout: 50 });
      blocked(f);
      assert.equal((await pending).details.timedOut, true);
      cleared(f);
      console.log("ok: timeout clears blocked status");
    }
    {
      const f = fixture();
      const { pending } = await open(f, { questions: [
        { question: "PRIVATE first", type: "text" }, { question: "PRIVATE second", type: "text" },
      ] });
      blocked(f);
      answer(f, "first");
      blocked(f);
      assert.equal(f.reports.filter((report) => report.state === "blocked").length, 1, "a batch must not spam notifications");
      answer(f, "second");
      assert.equal((await pending).details.answers.length, 2);
      cleared(f);
      console.log("ok: multi-question batch stays blocked with one notification transition");
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
