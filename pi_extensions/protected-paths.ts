/**
 * Protected Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 * Useful for preventing accidental modifications to sensitive files.
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const protectedPaths = [".env", ".envrc", ".git/", "node_modules/"];

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("write", event) && !isToolCallEventType("edit", event)) {
			return undefined;
		}

		const path = event.input.path;
		const isProtected = protectedPaths.some((p) => {
			if (p.endsWith("/")) {
				// Directory match: exact start or preceded by /
				return path === p.slice(0, -1) || path.startsWith(p) || path.includes("/" + p);
			}
			// File match: exact or at path end
			return path === p || path.endsWith("/" + p);
		});

		if (isProtected) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
