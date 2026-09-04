// Behavioral tests for git-interceptor.ts.
import { registerHooks } from "node:module";
import { resolve } from "./pi-resolve-hook.mjs";
import { assert, makePiHarness, runTests } from "./pi-test-harness.mjs";

registerHooks({ resolve });

const {
  BLOCK_REASON,
  default: gitInterceptor,
  interceptGitCommand,
  isGitCommand,
} = await import(new URL("./git-interceptor.ts", import.meta.url));

function bashEvent(command) {
  return { toolName: "bash", input: { command } };
}

await runTests(
  {
    "recognizes Git commands without matching unrelated words": async () => {
      assert(isGitCommand("git status"), "direct Git command is recognized");
      assert(isGitCommand("cd repo && git diff"), "chained Git command is recognized");
      assert(!isGitCommand("echo legitimate wording"), "unrelated text is ignored");
    },
    "prefixes Git commands with noninteractive editor settings": async () => {
      const result = interceptGitCommand("git commit -m 'message'");
      assert(!result.block, "ordinary Git command is allowed");
      assert(result.command.startsWith("export GIT_EDITOR=true"), "editor settings are prepended");
      assert(result.command.endsWith("git commit -m 'message'"), "original command is preserved");
    },
    "blocks no-verify without modifying the command": async () => {
      const command = "git commit --no-verify -m 'message'";
      const result = interceptGitCommand(command);
      assert(result.block, "no-verify command is blocked");
      assert(result.command === command, "blocked command is unchanged");
      assert(result.reason === BLOCK_REASON, "block reason explains the policy");
    },
    "wires policy through bash tool calls only": async () => {
      const harness = makePiHarness();
      gitInterceptor(harness.pi);

      const allowed = bashEvent("git status");
      const allowedResult = await harness.drive("tool_call", allowed, {});
      assert(allowedResult.length === 0, "allowed call is not blocked");
      assert(allowed.input.command.startsWith("export GIT_EDITOR=true"), "allowed call is rewritten");

      const blocked = bashEvent("git commit --no-verify");
      const blockedResult = await harness.drive("tool_call", blocked, {});
      assert(blockedResult[0].block === true, "blocked call returns a block result");
      assert(blockedResult[0].reason === BLOCK_REASON, "blocked call returns the policy reason");
    },
    "does not rewrite non-Git bash calls": async () => {
      const harness = makePiHarness();
      gitInterceptor(harness.pi);
      const event = bashEvent("printf 'hello\\n'");
      await harness.drive("tool_call", event, {});
      assert(event.input.command === "printf 'hello\\n'", "non-Git command remains unchanged");
    },
  },
  { name: "git-interceptor tests" },
);
