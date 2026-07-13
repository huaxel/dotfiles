import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LOG = process.env.PI_UMANS_HEADER_LOG;

function log(entry: Record<string, unknown>): void {
	if (!LOG) return;
	appendFileSync(LOG, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, "utf8");
}

/**
 * Minimal Umans header shim.
 *
 * Adds X-Umans-Websearch-Provider: none to all Umans provider requests so that
 * pi-web-access's client-side web_search tool is passed through to the model
 * instead of being intercepted by Umans server-side search.
 *
 * Designed to be used alongside the official pi-provider-umans package, which
 * handles model discovery, vision handoff, and status bar.
 */

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_headers", (event, ctx) => {
		if (ctx.model?.provider !== "umans") return;
		event.headers["X-Umans-Websearch-Provider"] = "none";
		log({ event: "header_set", model: ctx.model.id, value: event.headers["X-Umans-Websearch-Provider"] });
	});

	pi.on("tool_execution_start", (event, ctx) => {
		if (ctx.model?.provider !== "umans") return;
		log({ event: "tool_execution_start", toolName: event.toolName, toolCallId: event.toolCallId });
	});

	pi.on("tool_execution_end", (event, ctx) => {
		if (ctx.model?.provider !== "umans") return;
		log({ event: "tool_execution_end", toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError, resultText: JSON.stringify(event.result).slice(0, 200) });
	});
}
