import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export const GIT_ENV_PREFIX =
  "export GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true GIT_MERGE_AUTOEDIT=no\n";

export const NO_VERIFY_RE = /--no-verify\b/;

export const BLOCK_REASON =
  "BLOCKED: --no-verify is not allowed. Git hooks exist for a reason. " +
  "Do not attempt to bypass them. Instead: fix the underlying issue that " +
  "is causing the hook to fail, or ask the user for help.";

export function isGitCommand(command: string): boolean {
  return /\bgit\b/.test(command);
}

export interface GitInterception {
  command: string;
  block: boolean;
  reason?: string;
}

/** Apply Git safety policy without pretending to be a shell parser. */
export function interceptGitCommand(command: string): GitInterception {
  if (!isGitCommand(command)) return { command, block: false };
  if (NO_VERIFY_RE.test(command)) {
    return { command, block: true, reason: BLOCK_REASON };
  }
  return { command: `${GIT_ENV_PREFIX}${command}`, block: false };
}

export default function gitInterceptor(pi: ExtensionAPI): void {
  pi.on("tool_call", (event) => {
    if (!isToolCallEventType("bash", event)) return;

    const interception = interceptGitCommand(event.input.command);
    if (interception.block) {
      return { block: true, reason: interception.reason };
    }
    event.input.command = interception.command;
  });
}
