/**
 * Ghostty Theme Sync Extension
 *
 * Syncs pi theme with Ghostty terminal colors on startup.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CustomEditor,
	type ExtensionAPI,
	getAgentDir,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { applyEditorBackground, liveEditorStyle } from "./editor.js";
import { generatePiTheme, parseGhosttyConfig } from "./theme.js";

export { liveEditorStyle } from "./editor.js";
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

class GhosttyBackgroundEditor extends CustomEditor {
	private readonly getPiTheme: () => Theme;

	constructor(
		tui: TUI,
		editorTheme: EditorTheme,
		keybindings: KeybindingsManager,
		getPiTheme: () => Theme,
	) {
		super(tui, editorTheme, keybindings);
		this.getPiTheme = getPiTheme;
	}

	render(width: number): string[] {
		const theme = this.getPiTheme();
		const inheritedBorderColor = this.borderColor;
		this.borderColor = (text: string) => theme.fg(liveEditorStyle.border, text);

		try {
			// Theme.bg resets only the background. Re-apply it after resets emitted
			// by the editor cursor and autocomplete selection so every cell stays
			// filled.
			const backgroundReset = "\x1b[49m";
			const backgroundPrefix = theme.bg(liveEditorStyle.background, "").slice(0, -backgroundReset.length);

			// Do not override handleInput: CustomEditor delegates to Pi's normal
			// keybindings, app actions, editing state, and autocomplete provider.
			return super.render(width).map((line) => applyEditorBackground(line, backgroundPrefix));
		} finally {
			// Interactive mode copies the default editor's borderColor onto custom
			// editors. Restore it after rendering rather than fighting that hook.
			this.borderColor = inheritedBorderColor;
		}
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

		// If we're already on the correct synced theme, avoid an extra full-screen
		// repaint, but still install the editor decoration below.
		if (ctx.ui.theme.name !== themeName) {
			const themeJson = generatePiTheme(colors, themeName);
			writeFileSync(themePath, JSON.stringify(themeJson, null, 2));

			// Remove old generated themes so the themes dir doesn't grow forever.
			cleanupOldGhosttyThemes(themesDir, themeFile);

			// Important: set by name, so pi loads from the file we just wrote.
			const result = ctx.ui.setTheme(themeName);
			if (!result.success) {
				ctx.ui.notify(`Ghostty theme sync failed: ${result.error}`, "error");
			}
		}

		// A custom editor is the supported way to style the live prompt: Pi's
		// theme schema has no editor background token. Do not replace another
		// extension's custom editor; that would risk losing its behavior.
		if (!ctx.ui.getEditorComponent()) {
			ctx.ui.setEditorComponent((tui, editorTheme, keybindings) =>
				new GhosttyBackgroundEditor(tui, editorTheme, keybindings, () => ctx.ui.theme),
			);
		}
	});
}
