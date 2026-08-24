/**
 * Ghostty Theme Sync Extension
 *
 * Syncs pi theme with Ghostty terminal colors on startup.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { generatePiTheme, parseGhosttyConfig } from "./theme.js";

export { generatePiTheme, parseGhosttyConfig } from "./theme.js";

function getGhosttyColors() {
	try {
		const output = execSync("ghostty +show-config", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return parseGhosttyConfig(output);
	} catch {
		return null;
	}
}

function computeThemeHash(colors: ReturnType<typeof parseGhosttyConfig>): string {
	const parts: string[] = [];
	parts.push(`bg=${colors.background}`);
	parts.push(`fg=${colors.foreground}`);
	for (let i = 0; i <= 15; i++) {
		parts.push(`p${i}=${colors.palette[i] ?? ""}`);
	}
	const signature = parts.join("\n");
	return createHash("sha1").update(signature).digest("hex").slice(0, 8);
}

function cleanupOldGhosttyThemes(themesDir: string, keepFile: string): void {
	try {
		for (const file of readdirSync(themesDir)) {
			if (file === keepFile) continue;
			if (file === "ghostty-sync.json") {
				// Legacy file name from older versions
				unlinkSync(join(themesDir, file));
				continue;
			}
			if (file.startsWith("ghostty-sync-") && file.endsWith(".json")) {
				unlinkSync(join(themesDir, file));
			}
		}
	} catch {
		// Best-effort cleanup
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const colors = getGhosttyColors();
		if (!colors) {
			return;
		}

		const themesDir = join(getAgentDir(), "themes");
		if (!existsSync(themesDir)) {
			mkdirSync(themesDir, { recursive: true });
		}

		const hash = computeThemeHash(colors);
		const themeName = `ghostty-sync-${hash}`;
		const themeFile = `${themeName}.json`;
		const themePath = join(themesDir, themeFile);

		// If we're already on the correct synced theme, do nothing.
		// This avoids an extra full-screen repaint on startup.
		if (ctx.ui.theme.name === themeName) {
			return;
		}

		const themeJson = generatePiTheme(colors, themeName);
		writeFileSync(themePath, JSON.stringify(themeJson, null, 2));

		// Remove old generated themes so the themes dir doesn't grow forever.
		cleanupOldGhosttyThemes(themesDir, themeFile);

		// Important: set by name, so pi loads from the file we just wrote.
		const result = ctx.ui.setTheme(themeName);
		if (!result.success) {
			ctx.ui.notify(`Ghostty theme sync failed: ${result.error}`, "error");
		}
	});
}
