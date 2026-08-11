/**
 * go-on — one-key continuation + "auto" mode for simple conversations.
 *
 * Universal keys (same on every terminal):
 *   - ctrl+alt+n — single nudge: sends "go on" as a user message.
 *   - ctrl+alt+g — burst: sends "go on" AND arms auto mode in one press
 *     (press again to stop): pi then keeps sending "go on" after every
 *     agent settle until the agent has nothing left to do, and disarms
 *     itself. The second press is the whole toggle (/go-on-mode on|off is
 *     the command fallback). A lighter-weight alternative to /goal when
 *     goal ceremony is overkill.
 *
 * Why this pair works everywhere:
 *   - Ctrl+Alt+letter sends ESC + ctrl-char on every legacy terminal
 *     (ESC \x07 for g, ESC \x0e for n) — macOS included, where plain
 *     Option+letter types Unicode (© for g, ˝ for shift+g) instead of a
 *     key event, so alt+g / alt+shift+g can never fire there. On
 *     kitty-protocol terminals (iTerm2/kitty/WezTerm/Ghostty) the same
 *     chords arrive as CSI-u sequences and match too.
 *   - Some SSH clients (notably Termius) drop the Ctrl bit on Ctrl+Alt
 *     chords and send plain Alt+letter (ESC g / ESC n). The plain-alt
 *     variants are therefore registered as fallbacks with the same
 *     handlers. There is no double-fire: the modifier bitmask differs
 *     (alt=2 vs ctrl+alt=6), so a given sequence matches exactly one.
 *   - alt+shift+enter / alt+enter were rejected: the former needs
 *     Shift+Alt reporting that legacy terminals cannot encode, and the
 *     latter is reserved by pi's app.message.followUp (extensions on that
 *     key are skipped) and bound by terminals themselves (GNOME Terminal
 *     opens a new window, Windows Terminal toggles fullscreen).
 *   - Neither ctrl+alt+n / alt+n nor ctrl+alt+g / alt+g collides with any
 *     pi built-in or common terminal binding (verified by
 *     go-on.keys.test.mjs against pi's real reserved-key logic).
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
  /** Avoid wedging auto mode if Pi rejects a nudge before agent_start. */
  const NUDGE_START_TIMEOUT_MS = 60_000;
  /** Nudge this many purely verbal answers before declaring the agent done. */
  const VERBAL_PASSES = 1;
  type GoOnContext = ExtensionContext | ExtensionCommandContext;

  /** Explicit completion declarations. End-anchored on purpose:
   *  "I'm done with X, now doing Y" is a pause, not a wrap-up. Unqualified
   *  "all set" / "wrapped up" are deliberately absent: subject-qualified
   *  phase statements ("The environment is all set", "Phase one is wrapped
   *  up") would otherwise disarm mid-task. Whole-message "All set." /
   *  "Wrapped up." still count via STANDALONE_DONE_PHRASE below. */
  const DONE_PHRASE =
    /\b(?:all done|done here|done with everything|everything['’]?s done|task complete|tasks complete|i['’]?m done|i am done|that['’]s (?:it|all)|that is all|nothing (?:else|more|left)(?: to do)?|no further (?:work|tasks|steps))\b[.!?]*$/i;
  const SUBJECT_DONE_PHRASE =
    /^(?:(?:the|all) )?(?:task|tasks|work|changes|implementation|request|refactor|job|project|goal|deliverable|assignment|everything) (?:is|are|was|were|has been|have been) (?:done|complete|completed|finished|all set|wrapped up)[.!?]*$/i;
  const STANDALONE_DONE_PHRASE = /^(?:done|finished|completed|complete|all set|wrapped up)[.!?]*$/i;
  const NEGATED_DONE_PHRASE =
    /\b(?:not|never|isn['’]?t|is not|wasn['’]?t|was not|haven['’]?t|have not|hasn['’]?t|has not|don['’]?t|do not)\b[^.!?\n]*\b(?:done|complete|completed|finished|all set)\b[.!?]*$/i;

  let mode = false;
  let nudges = 0;
  let toolsSinceSettle = false; // did the settled run execute any tools?
  let verbalStreak = 0; // consecutive settles without tool work
  let idleNudgePending = false; // an idle nudge is in preflight/startup
  let idleNudgeTimer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (ctx: GoOnContext, text: string | undefined) =>
    ctx.ui.setStatus("go-on-mode", text);

  const notify = (
    ctx: GoOnContext,
    msg: string,
    type: "info" | "warning" | "error" = "info",
  ) => ctx.ui.notify(msg, type);

  function clearIdleNudgePending() {
    idleNudgePending = false;
    if (idleNudgeTimer !== undefined) {
      clearTimeout(idleNudgeTimer);
      idleNudgeTimer = undefined;
    }
  }

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
      idleNudgeTimer = setTimeout(() => {
        if (!idleNudgePending) return;
        clearIdleNudgePending();
        if (requiresMode && mode) {
          disarm(ctx, "nudge did not start");
        }
      }, NUDGE_START_TIMEOUT_MS);

      if (!ctx.model) {
        clearIdleNudgePending();
        if (mode) disarm(ctx, "no model selected");
        else notify(ctx, "Go-on unavailable — no model selected", "warning");
        return false;
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (requiresMode && !mode) {
        clearIdleNudgePending();
        return false;
      }
      if (!idleNudgePending) return false;
      if (!auth.ok) {
        clearIdleNudgePending();
        if (mode) disarm(ctx, "authentication unavailable");
        else notify(ctx, "Go-on unavailable — authentication unavailable", "warning");
        return false;
      }

      // Another prompt may have started while auth was being resolved. Let
      // that run finish instead of injecting a stale manual/auto nudge into it.
      if (!ctx.isIdle()) {
        clearIdleNudgePending();
        return false;
      }
    }

    try {
      pi.sendUserMessage(GO_ON, { deliverAs: "steer" });
      return true;
    } catch (error) {
      if (startedIdle) clearIdleNudgePending();
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
    clearIdleNudgePending();
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
    if (NEGATED_DONE_PHRASE.test(normalized)) return false;
    return (
      DONE_PHRASE.test(normalized) ||
      SUBJECT_DONE_PHRASE.test(normalized) ||
      STANDALONE_DONE_PHRASE.test(normalized)
    );
  }

  // agent_start confirms that an idle nudge passed Pi's asynchronous
  // preflight. agent_settled clears the same guard before considering the
  // next automatic nudge.
  pi.on("agent_start", () => {
    clearIdleNudgePending();
  });

  pi.on("session_shutdown", () => {
    mode = false;
    clearIdleNudgePending();
  });

  pi.on("tool_execution_end", () => {
    if (mode) toolsSinceSettle = true;
  });

  pi.on("agent_settled", async (_event, ctx) => {
    clearIdleNudgePending();
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
  pi.registerShortcut("ctrl+alt+n", {
    description: "Send 'go on' as a user message",
    handler: async (ctx) => {
      await nudge(ctx);
    },
  });
  // Fallback for SSH clients that drop the Ctrl bit (Termius sends ESC n).
  pi.registerShortcut("alt+n", {
    description: "Send 'go on' as a user message (Ctrl+Alt fallback)",
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

  // One press = send "go on" (immediate when idle, steer-queued while
  // streaming) + arm the burst; press again to stop it.
  const burstShortcut = async (ctx: GoOnContext) => {
    if (mode) {
      disarm(ctx, "toggled off");
      return;
    }
    await arm(ctx, { immediateNudge: false });
    await autoNudge(ctx);
  };

  // Ctrl+Alt+G (ESC BEL on legacy terminals, CSI-u on kitty terminals) —
  // the only burst chord that works on every terminal: Shift+Alt cannot be
  // encoded on legacy terminals, and Alt+Enter is reserved by pi and bound
  // by terminals themselves (see header).
  pi.registerShortcut("ctrl+alt+g", {
    description: "Send 'go on' and enable go-on auto mode (press again to stop)",
    handler: burstShortcut,
  });
  // Fallback for SSH clients that drop the Ctrl bit (Termius sends ESC g).
  pi.registerShortcut("alt+g", {
    description: "Send 'go on' and enable go-on auto mode (Ctrl+Alt fallback)",
    handler: burstShortcut,
  });
}
