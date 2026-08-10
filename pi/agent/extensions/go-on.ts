/**
 * go-on — one-key continuation.
 *
 * Binds Ctrl+Shift+G to send "go on" as a user message, replacing the 2,000+
 * hand-typed nudges. Falls back to /go-on command.
 *
 * Key:   ctrl+shift+g   (ctrl+g is app.editor.external and reserved)
 * Tools: /go-on
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const GO_ON = "go on";

  const nudge = (_ctx: ExtensionContext | ExtensionCommandContext) => {
    // pi.sendUserMessage always triggers a turn; steer queues while streaming.
    pi.sendUserMessage(GO_ON, { deliverAs: "steer" });
  };

  /* Ctrl+Shift+G — the whole point. */
  pi.registerShortcut("ctrl+shift+g", {
    description: "Send 'go on' as a user message",
    handler: nudge,
  });

  /* /go-on — same thing, for when your hands are on the keyboard already. */
  pi.registerCommand("go-on", {
    description: "Send 'go on' as a user message",
    handler: async (_args, ctx) => {
      nudge(ctx);
    },
  });
}