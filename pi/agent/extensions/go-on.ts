/**
 * go-on — one-key continuation + "auto" mode for simple conversations.
 *
 * Single nudge:   alt+g (or /go-on) sends "go on" as a user message.
 * Auto mode:      shift+alt+enter sends "go on" AND arms the burst in one
 *                 press (press again to stop): pi then keeps sending "go on"
 *                 after every agent settle until the agent has nothing left
 *                 to do, and disarms itself. alt+shift+g or /go-on-mode
 *                 toggle the same mode without the extra nudge. A lighter-
 *                 weight alternative to /goal when goal ceremony is
 *                 overkill.
 *
 * Key choices:
 *   - alt+g is unambiguous (ESC g) and unbound; ctrl+shift+g collides with
 *     app.editor.external on terminals without the Kitty protocol (both
 *     send the same raw ctrl+g byte).
 *   - macOS Option+letter types Unicode (© for g) instead of a key event,
 *     so alt+g / alt+shift+g can't fire there; shift+alt+enter is reported
 *     with full modifier info by kitty-protocol terminals (iTerm2/kitty/
 *     WezTerm/Ghostty), making it the reliable Mac binding.
 *   - alt+shift+g (ESC G) stays as the Linux toggle, adjacent and
 *     unambiguous for the same reason as alt+g.
 *
 * Auto-mode stop heuristic, evaluated at each agent_settled:
 *   - stop immediately on user abort or model error (don't burn calls,
 *     never undo an Esc)
 *   - nudge every run that did tool work, or ended mid-work
 *     (stopReason toolUse/length — run stopped between tool calls)
 *   - nudge through up to VERBAL_PASSES purely verbal answers (the classic
 *     "done with step 1" pause) even if they don't ask anything
 *   - stop on the first answer that clearly declares completion
 *     (DONE_PHRASE is end-anchored, so "I'm done with the refactor,
 *     moving to tests" does NOT count — that's a pause, not a wrap-up)
 *   - stop after two consecutive verbal answers with no tool work
 *   - hard cap (MAX_NUDGES) as a safety net against work loops
 */
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const GO_ON = "go on";
  const MAX_NUDGES = 15;
  /** Nudge this many purely verbal answers before declaring the agent done. */
  const VERBAL_PASSES = 1;

  /** Final answers that declare completion. End-anchored on purpose:
   *  "I'm done with X, now doing Y" is a pause, not a wrap-up. */
  const DONE_PHRASE =
    /(all done|done here|done with everything|everything'?s done|task complete|tasks complete|i'?m done|i am done|that'?s it|that'?s all|that is all|all set|wrapped up|finished|completed|complete|done|nothing (else|more|left)|no further (work|tasks|steps))[.!?]*$/i;

  let mode = false;
  let nudges = 0;
  let toolsSinceSettle = false; // did the settled run execute any tools?
  let verbalStreak = 0; // consecutive settles without tool work

  /** Send the literal "go on" as a user message. deliverAs "steer" is a
   *  no-op when idle (sends immediately, triggers a turn) and queues while
   *  streaming — safe from both the manual keybind and the auto loop. */
  const nudge = () => pi.sendUserMessage(GO_ON, { deliverAs: "steer" });

  const setStatus = (
    ctx: ExtensionContext | ExtensionCommandContext,
    text: string | undefined,
  ) => ctx.ui.setStatus("go-on-mode", text);

  const notify = (ctx: ExtensionContext | ExtensionCommandContext, msg: string) =>
    ctx.ui.notify(msg, "info");

  function arm(
    ctx: ExtensionContext | ExtensionCommandContext,
    { immediateNudge = true }: { immediateNudge?: boolean } = {},
  ) {
    mode = true;
    nudges = 0;
    toolsSinceSettle = false;
    verbalStreak = 0;
    setStatus(ctx, "go-on: armed");
    notify(ctx, "Go-on mode ON — sending 'go on' until the agent has nothing left to do");
    // Agent already stopped: kick off the burst right away. If it's mid-run,
    // the next agent_settled picks it up.
    if (immediateNudge && ctx.isIdle()) nudge();
  }

  function disarm(ctx: ExtensionContext | ExtensionCommandContext, reason: string) {
    mode = false;
    setStatus(ctx, undefined);
    notify(ctx, `Go-on mode OFF (${reason})`);
  }

  /** The last assistant message in the current branch, or undefined. */
  function lastAssistantMessage(ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getBranch();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry?.type === "message" && entry.message?.role === "assistant") {
        return entry.message;
      }
    }
    return undefined;
  }

  function finalText(message: { content: unknown }): string {
    if (typeof message.content === "string") return message.content;
    return (message.content as Array<{ type?: string; text?: string }>)
      .filter((c) => c?.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  }

  pi.on("tool_execution_end", () => {
    if (mode) toolsSinceSettle = true;
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!mode) return;

    const last = lastAssistantMessage(ctx);
    if (!last) {
      disarm(ctx, "no agent response to continue");
      return;
    }

    const reason = last.stopReason as string | undefined;
    if (reason === "aborted" || reason === "error") {
      disarm(ctx, reason === "aborted" ? "you stopped the agent" : "agent errored");
      return;
    }

    // Work happened (tools ran, or the run stopped mid-tool-use / truncated)?
    const didWork = toolsSinceSettle || reason === "toolUse" || reason === "length";

    if (didWork) {
      verbalStreak = 0;
    } else {
      // Purely verbal answer with no tool work.
      if (DONE_PHRASE.test(finalText(last))) {
        disarm(ctx, "agent says it's done");
        return;
      }
      // Nudge through a pause or two, then call it done if nothing happens.
      if (verbalStreak >= VERBAL_PASSES) {
        disarm(ctx, "no work after repeated nudges");
        return;
      }
      verbalStreak += 1;
    }

    if (nudges >= MAX_NUDGES) {
      disarm(ctx, `nudge cap reached (${MAX_NUDGES})`);
      return;
    }

    // Nudge and wait for the next settle.
    toolsSinceSettle = false;
    nudges += 1;
    setStatus(ctx, `go-on: armed (${nudges})`);
    nudge();
  });

  function toggle(ctx: ExtensionContext | ExtensionCommandContext, arg?: string) {
    const want = arg === "on" ? true : arg === "off" ? false : !mode;
    if (want === mode) return;
    if (want) arm(ctx);
    else disarm(ctx, "toggled off");
  }

  // --- Single nudge ---
  pi.registerShortcut("alt+g", {
    description: "Send 'go on' as a user message",
    handler: nudge,
  });

  pi.registerCommand("go-on", {
    description: "Send 'go on' as a user message",
    handler: async () => nudge(),
  });

  // --- Auto mode ---
  pi.registerCommand("go-on-mode", {
    description:
      "Toggle go-on auto mode — keeps sending 'go on' until the agent has nothing left to do",
    handler: async (args, ctx) => toggle(ctx, args?.trim().toLowerCase()),
  });

  // macOS: Option+letter types Unicode (© for g), so the reliable Mac key
  // is shift+alt+enter (kitty-protocol terminals report full modifier
  // info). One press = send "go on" (immediate when idle, steer-queued
  // while streaming) + arm the burst; press again to stop it.
  pi.registerShortcut("shift+alt+enter", {
    description: "Send 'go on' and enable go-on auto mode (macOS)",
    handler: (ctx) => {
      if (mode) {
        disarm(ctx, "toggled off");
        return;
      }
      nudge();
      arm(ctx, { immediateNudge: false });
    },
  });

  // Linux: alt+shift+g (ESC G) — unambiguous, adjacent to alt+g.
  pi.registerShortcut("alt+shift+g", {
    description: "Toggle go-on auto mode",
    handler: (ctx) => toggle(ctx),
  });
}
