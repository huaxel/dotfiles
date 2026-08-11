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
  /** Maximum number of automatic "go on" messages per burst. */
  const MAX_NUDGES = 15;
  /** Nudge this many purely verbal answers before declaring the agent done. */
  const VERBAL_PASSES = 1;
  type GoOnContext = ExtensionContext | ExtensionCommandContext;

  /** Final answers that declare completion. End-anchored on purpose:
   *  "I'm done with X, now doing Y" is a pause, not a wrap-up. */
  const DONE_PHRASE =
    /\b(?:all done|done here|done with everything|everything['’]?s done|task complete|tasks complete|i['’]?m done|i am done|that['’]s (?:it|all)|that is all|all set|wrapped up|finished|completed|complete|done|nothing (?:else|more|left)(?: to do)?|no further (?:work|tasks|steps))\b[.!?]*$/i;
  const NEGATED_DONE_PHRASE =
    /\b(?:not|never|isn['’]?t|is not|wasn['’]?t|was not|haven['’]?t|have not|hasn['’]?t|has not|don['’]?t|do not)\s+(?:all\s+)?(?:done|complete(?:d)?|finished|all set)\b[.!?]*$/i;

  let mode = false;
  let nudges = 0;
  let toolsSinceSettle = false; // did the settled run execute any tools?
  let verbalStreak = 0; // consecutive settles without tool work
  let idleNudgePending = false; // an idle nudge is in preflight/startup

  const setStatus = (ctx: GoOnContext, text: string | undefined) =>
    ctx.ui.setStatus("go-on-mode", text);

  const notify = (
    ctx: GoOnContext,
    msg: string,
    type: "info" | "warning" | "error" = "info",
  ) => ctx.ui.notify(msg, type);

  /** Send "go on", avoiding overlapping idle prompts and preflighting auth. */
  async function nudge(
    ctx: GoOnContext,
    { requiresMode = false }: { requiresMode?: boolean } = {},
  ): Promise<boolean> {
    if (requiresMode && !mode) return false;

    const startedIdle = ctx.isIdle();
    if (startedIdle) {
      // Pi's public sendUserMessage API is fire-and-forget. Its async
      // preflight can leave isIdle() true long enough for a second prompt to
      // start, so serialize idle nudges locally.
      if (idleNudgePending) return false;
      idleNudgePending = true;

      if (!ctx.model) {
        idleNudgePending = false;
        if (mode) disarm(ctx, "no model selected");
        else notify(ctx, "Go-on unavailable — no model selected", "warning");
        return false;
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (requiresMode && !mode) {
        idleNudgePending = false;
        return false;
      }
      if (!auth.ok) {
        idleNudgePending = false;
        if (mode) disarm(ctx, "authentication unavailable");
        else notify(ctx, "Go-on unavailable — authentication unavailable", "warning");
        return false;
      }

      // Another prompt may have started while auth was being resolved. Let
      // that run finish instead of injecting a stale manual/auto nudge into it.
      if (!ctx.isIdle()) {
        idleNudgePending = false;
        return false;
      }
    }

    try {
      pi.sendUserMessage(GO_ON, { deliverAs: "steer" });
      return true;
    } catch (error) {
      if (startedIdle) idleNudgePending = false;
      const detail = error instanceof Error ? error.message : String(error);
      if (mode) disarm(ctx, `could not send (${detail})`);
      else notify(ctx, `Could not send 'go on' (${detail})`, "warning");
      return false;
    }
  }

  async function autoNudge(ctx: GoOnContext): Promise<boolean> {
    if (!mode) return false;
    if (nudges >= MAX_NUDGES) {
      disarm(ctx, `nudge cap reached (${MAX_NUDGES})`);
      return false;
    }

    const sent = await nudge(ctx, { requiresMode: true });
    if (!sent) return false;

    nudges += 1;
    setStatus(ctx, `go-on: armed (${nudges})`);
    return true;
  }

  async function arm(
    ctx: GoOnContext,
    { immediateNudge = true }: { immediateNudge?: boolean } = {},
  ) {
    mode = true;
    nudges = 0;
    toolsSinceSettle = false;
    verbalStreak = 0;
    setStatus(ctx, "go-on: armed");
    notify(ctx, "Go-on mode ON — sending 'go on' until the agent has nothing left to do");
    // The combined shortcut starts immediately; plain toggles deliberately
    // arm without an initial nudge and wait for the next settled run.
    if (immediateNudge && ctx.isIdle()) await autoNudge(ctx);
  }

  function disarm(ctx: GoOnContext, reason: string) {
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
    if (!Array.isArray(message.content)) return "";
    return (message.content as Array<{ type?: string; text?: string }>)
      .filter((c) => c?.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  }

  function declaresCompletion(text: string): boolean {
    const normalized = text.trim();
    return DONE_PHRASE.test(normalized) && !NEGATED_DONE_PHRASE.test(normalized);
  }

  // agent_start confirms that an idle nudge passed Pi's asynchronous
  // preflight. agent_settled clears the same guard before considering the
  // next automatic nudge.
  pi.on("agent_start", () => {
    idleNudgePending = false;
  });

  pi.on("session_shutdown", () => {
    mode = false;
    idleNudgePending = false;
  });

  pi.on("tool_execution_end", () => {
    if (mode) toolsSinceSettle = true;
  });

  pi.on("agent_settled", async (_event, ctx) => {
    idleNudgePending = false;
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

    // A clear completion declaration wins even when the run used tools.
    if (declaresCompletion(finalText(last))) {
      disarm(ctx, "agent says it's done");
      return;
    }

    // Work happened (tools ran, or the run stopped mid-tool-use / truncated)?
    const didWork = toolsSinceSettle || reason === "toolUse" || reason === "length";

    if (didWork) {
      verbalStreak = 0;
    } else {
      // Nudge through a pause or two, then call it done if nothing happens.
      if (verbalStreak >= VERBAL_PASSES) {
        disarm(ctx, "no work after repeated nudges");
        return;
      }
      verbalStreak += 1;
    }

    toolsSinceSettle = false;
    await autoNudge(ctx);
  });

  async function toggle(ctx: GoOnContext, arg?: string) {
    const value = arg?.trim().toLowerCase() ?? "";
    if (value !== "" && value !== "on" && value !== "off") {
      notify(ctx, "Usage: /go-on-mode [on|off]", "warning");
      return;
    }

    const want = value === "on" ? true : value === "off" ? false : !mode;
    if (want === mode) return;
    if (want) await arm(ctx, { immediateNudge: false });
    else disarm(ctx, "toggled off");
  }

  // --- Single nudge ---
  pi.registerShortcut("alt+g", {
    description: "Send 'go on' as a user message",
    handler: async (ctx) => {
      await nudge(ctx);
    },
  });

  pi.registerCommand("go-on", {
    description: "Send 'go on' as a user message",
    handler: async (_args, ctx) => {
      await nudge(ctx);
    },
  });

  // --- Auto mode ---
  pi.registerCommand("go-on-mode", {
    description:
      "Toggle go-on auto mode — keeps sending 'go on' until the agent has nothing left to do",
    handler: async (args, ctx) => {
      await toggle(ctx, args);
    },
  });

  // macOS: Option+letter types Unicode (© for g), so the reliable Mac key
  // is shift+alt+enter (kitty-protocol terminals report full modifier
  // info). One press = send "go on" (immediate when idle, steer-queued
  // while streaming) + arm the burst; press again to stop it.
  pi.registerShortcut("shift+alt+enter", {
    description: "Send 'go on' and enable go-on auto mode (macOS)",
    handler: async (ctx) => {
      if (mode) {
        disarm(ctx, "toggled off");
        return;
      }
      await arm(ctx, { immediateNudge: false });
      await autoNudge(ctx);
    },
  });

  // Linux: alt+shift+g (ESC G) — unambiguous, adjacent to alt+g.
  pi.registerShortcut("alt+shift+g", {
    description: "Toggle go-on auto mode",
    handler: async (ctx) => {
      await toggle(ctx);
    },
  });
}
