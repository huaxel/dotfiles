/**
 * Session naming.
 *
 * /session-name [name] — set or show session name.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("session-name", {
    description: "Set or show session name. Usage: /session-name [name]",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (name) {
        pi.setSessionName(name);
        ctx.ui.notify(`Session named: ${name}`, "info");
      } else {
        const current = pi.getSessionName();
        ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
      }
    },
  });
}
