import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";

type IntercomEvent = {
  type: string;
  payload?: unknown;
};

type IntercomChannel = {
  publish(payload: unknown, options?: { audience?: "owner" | "capable"; ownerOnly?: boolean }): void;
};

const INTERCOM_REGISTER = "intercom:extension-register";
const INTERCOM_READY = "intercom:extension-registry-ready";
const INTERCOM_NAMESPACE = "herdr-fork";
const TOKEN_ENV = "PI_HERDR_FORK_TOKEN";
const PROMPT_ENV = "PI_HERDR_FORK_PROMPT";

function parseArguments(raw: string): { placement: "split" | "tab"; prompt: string } {
  const args = raw.trim();
  const match = /^(split|tab)(?:\s+|$)(.*)$/s.exec(args);
  if (!match) return { placement: "split", prompt: args };
  return { placement: match[1] as "split" | "tab", prompt: match[2].trim() };
}

export default function (pi: ExtensionAPI) {
  let intercom: IntercomChannel | undefined;
  let intercomAttached = false;
  let promptSent = false;

  const publish = (payload: unknown) => {
    try {
      intercom?.publish(payload, { audience: "capable" });
    } catch {
      // pi-intercom is optional; the fork itself does not depend on it.
    }
  };

  const tryRegisterIntercom = () => {
    if (intercomAttached) return;
    pi.events.emit(INTERCOM_REGISTER, {
      namespace: INTERCOM_NAMESPACE,
      ownerEligible: false,
      onEvent: (event: IntercomEvent) => {
        if (event.type !== "message" || !event.payload || typeof event.payload !== "object") return;
        const payload = event.payload as { type?: string; token?: string };
        if (payload.type !== "ready" || payload.token !== process.env[TOKEN_ENV]) return;
        // The child has loaded its forked session and is ready for follow-ups.
        pi.ui.notify("Herdr fork is ready", "info");
      },
      onReady: (channel: IntercomChannel) => {
        intercom = channel;
        intercomAttached = true;
      },
    });
  };

  // Register immediately when pi-intercom was loaded first, and retry when it
  // announces its registry if this extension loaded before it.
  pi.events.on(INTERCOM_READY, tryRegisterIntercom);
  tryRegisterIntercom();

  pi.on("session_start", () => {
    const token = process.env[TOKEN_ENV];
    if (!token) return;

    publish({ type: "ready", token });

    const prompt = process.env[PROMPT_ENV]?.trim();
    if (!prompt || promptSent) return;
    promptSent = true;
    delete process.env[PROMPT_ENV];
    // Let the replacement session finish rendering before injecting its first
    // user turn. This also makes the command work when launched from a new tab.
    setTimeout(() => {
      pi.sendUserMessage(prompt);
    }, 150);
  });

  pi.on("agent_end", () => {
    const token = process.env[TOKEN_ENV];
    if (token) publish({ type: "settled", token });
  });

  const fork = async (rawArgs: string, ctx: ExtensionCommandContext) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) {
      ctx.ui.notify("Cannot fork an ephemeral Pi session", "error");
      return;
    }
    if (!process.env.HERDR_PANE_ID) {
      ctx.ui.notify("Pi is not running in a Herdr pane", "error");
      return;
    }

    const { placement, prompt } = parseArguments(rawArgs);
    const token = randomUUID();
    const action = placement === "tab" ? "herdr-plugins.fork.fork" : "herdr-plugins.fork.fork-split";
    const herdr = process.env.HERDR_BIN_PATH || "herdr";
    const envArgs = [
      `${TOKEN_ENV}=${token}`,
      `${PROMPT_ENV}=${prompt}`,
      herdr,
      "plugin",
      "action",
      "invoke",
      action,
    ];

    const result = await pi.exec("env", envArgs, { timeout: 15_000 });
    if (result.code !== 0) {
      const detail = result.stderr.trim() || "Herdr could not open the fork pane";
      ctx.ui.notify(detail, "error");
      return;
    }

    ctx.ui.notify(
      prompt
        ? `Forked to a Herdr ${placement} with the initial prompt`
        : `Forked to a Herdr ${placement}`,
      "info",
    );
  };

  pi.registerCommand("fork-pane", {
    description: "Fork this Pi session into a Herdr split (or: tab [prompt])",
    handler: fork,
  });

  pi.registerCommand("hfork", {
    description: "Alias for /fork-pane",
    handler: fork,
  });
}
