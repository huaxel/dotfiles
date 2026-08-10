/**
 * go-on — one-key continuation.
 *
 * Binds Alt+G to send "go on" as a user message, replacing the 2,000+
 * hand-typed nudges. Falls back to /go-on command.
 *
 * Key:   alt+g   (ctrl+shift+g collides with app.editor.external on
 *                 terminals without the Kitty protocol — both send
 *                 the same raw ctrl+g byte)
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const GO_ON = "go on";

  const nudge = (_ctx: ExtensionContext | ExtensionCommandContext) => {
    // pi.sendUserMessage always triggers a turn; steer queues while streaming.
    pi.sendUserMessage(GO_ON, { deliverAs: "steer" });
  };

  /* Alt+G — the whole point. alt+g is unambiguous (ESC g) and unbound. */
  pi.registerShortcut("alt+g", {
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