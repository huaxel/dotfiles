/**
 * Pure Ghostty-to-Pi theme transformation.
 *
 * This module intentionally has no Pi runtime dependency so palette behavior
 * can be tested with plain Node before the extension is loaded by Pi.
 */

export interface GhosttyColors {
	background: string;
	foreground: string;
	palette: Record<number, string>;
}

export function parseGhosttyConfig(output: string): GhosttyColors {
	const colors: GhosttyColors = {
		background: "#1e1e1e",
		foreground: "#d4d4d4",
		palette: {},
	};

	for (const line of output.split("\n")) {
		const match = line.match(/^(\S+)\s*=\s*(.+)$/);
		if (!match) continue;

		const [, key, value] = match;
		const trimmedValue = value.trim();

		if (key === "background") {
			colors.background = normalizeColor(trimmedValue);
		} else if (key === "foreground") {
			colors.foreground = normalizeColor(trimmedValue);
		} else if (key === "palette") {
			const paletteMatch = trimmedValue.match(/^(\d+)=(.+)$/);
			if (paletteMatch) {
				const index = parseInt(paletteMatch[1], 10);
				if (index >= 0 && index <= 15) {
					colors.palette[index] = normalizeColor(paletteMatch[2]);
				}
			}
		}
	}

	return colors;
}

function normalizeColor(color: string): string {
	const trimmed = color.trim();
	if (trimmed.startsWith("#")) {
		if (trimmed.length === 4) {
			return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
		}
		return trimmed;
	}
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
		return `#${trimmed}`;
	}
	return `#${trimmed}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const h = hex.replace("#", "");
	return {
		r: parseInt(h.substring(0, 2), 16),
		g: parseInt(h.substring(2, 4), 16),
		b: parseInt(h.substring(4, 6), 16),
	};
}

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (n: number) => Math.round(Math.min(255, Math.max(0, n)));
	return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function getLuminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function getRelativeLuminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	const linearize = (channel: number) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function getContrastRatio(foreground: string, background: string): number {
	const foregroundLuminance = getRelativeLuminance(foreground);
	const backgroundLuminance = getRelativeLuminance(background);
	return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function ensureContrast(color: string, background: string, minimum: number): string {
	if (getContrastRatio(color, background) >= minimum) return color;

	// Move the color toward the endpoint that has the best chance of contrast,
	// preserving as much of the original hue as possible with a binary search.
	const endpoint = getLuminance(background) < 0.5 ? "#ffffff" : "#000000";
	if (getContrastRatio(endpoint, background) < minimum) return color;

	let low = 0;
	let high = 1;
	for (let i = 0; i < 12; i++) {
		const weight = (low + high) / 2;
		if (getContrastRatio(mixColors(endpoint, color, weight), background) >= minimum) {
			high = weight;
		} else {
			low = weight;
		}
	}
	return mixColors(endpoint, color, high);
}

function adjustBrightness(hex: string, amount: number): string {
	const { r, g, b } = hexToRgb(hex);
	return rgbToHex(r + amount, g + amount, b + amount);
}

function mixColors(color1: string, color2: string, weight: number): string {
	const c1 = hexToRgb(color1);
	const c2 = hexToRgb(color2);
	return rgbToHex(
		c1.r * weight + c2.r * (1 - weight),
		c1.g * weight + c2.g * (1 - weight),
		c1.b * weight + c2.b * (1 - weight)
	);
}

export function generatePiTheme(colors: GhosttyColors, themeName: string): object {
	const bg = colors.background;
	const fg = colors.foreground;
	const isDark = getLuminance(bg) < 0.5;

	// ANSI color slots - trust the standard for semantic colors.
	// Note: we intentionally do NOT use palette[0]/palette[8] as "neutral" colors.
	// Some themes have non-black "black" slots.
	const error = ensureContrast(colors.palette[1] || "#cc6666", bg, 4.5);
	const success = ensureContrast(colors.palette[2] || "#98c379", bg, 4.5);
	const warning = ensureContrast(colors.palette[3] || "#e5c07b", bg, 4.5);
	const link = ensureContrast(colors.palette[4] || "#61afef", bg, 4.5);

	// "Accent" is a judgment call.
	const accent = ensureContrast(colors.palette[5] || "#c678dd", bg, 4.5);
	const accentAlt = ensureContrast(colors.palette[6] || "#56b6c2", bg, 4.5);

	// Derive neutrals from bg/fg for consistent readability across themes
	const muted = mixColors(fg, bg, 0.65);
	// Keep secondary output subdued, but readable on tinted tool/search surfaces.
	const toolOutput = mixColors(fg, bg, 0.78);
	const dim = mixColors(fg, bg, isDark ? 0.60 : 0.45);
	const borderMuted = mixColors(fg, bg, isDark ? 0.45 : 0.30);
	// Calm neutral border so only borderAccent draws the eye; sits a clear step
	// above borderMuted and below the saturated accent hues.
	const border = mixColors(fg, bg, isDark ? 0.52 : 0.38);

	// Keep bg/fg for export and derived backgrounds
	const _fg = fg;
	const _bg = bg;

	// Derive backgrounds
	const bgShift = isDark ? 12 : -12;
	const selectedBg = adjustBrightness(bg, bgShift);
	const userMsgBg = adjustBrightness(bg, Math.round(bgShift * 0.7));
	const toolPendingBg = adjustBrightness(bg, Math.round(bgShift * 0.4));
	const toolSuccessBg = mixColors(bg, success, 0.88);
	const toolErrorBg = mixColors(bg, error, 0.88);
	// Distinct warm-tinted search-match bg so /search hits pop vs selection.
	const searchMatchBg = mixColors(bg, warning, 0.80);
	const customMsgBg = mixColors(bg, accent, 0.92);

	return {
		$schema: "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
		name: themeName,
		vars: {
			bg: _bg,
			fg: _fg,
			accent,
			accentAlt,
			link,
			error,
			success,
			warning,
			muted,
			dim,
			border,
			borderMuted,
			selectedBg,
			scrollbarThumb: mixColors(fg, bg, isDark ? 0.55 : 0.5),
			searchMatchBg,
			userMsgBg,
			toolPendingBg,
			toolSuccessBg,
			toolErrorBg,
			customMsgBg,
			toolOutput,
		},
		colors: {
			// Core UI
			accent: "accent",
			border: "border",
			borderAccent: "accent",
			borderMuted: "borderMuted",
			success: "success",
			error: "error",
			warning: "warning",
			muted: "muted",
			dim: "dim",
			text: "",
			thinkingText: "muted",

			// Backgrounds
			selectedBg: "selectedBg",
			scrollbarThumb: "scrollbarThumb",
			searchMatchBg: "searchMatchBg",
			searchMatchText: "fg",
			userMessageBg: "userMsgBg",
			userMessageText: "fg",
			customMessageBg: "customMsgBg",
			customMessageText: "fg",
			customMessageLabel: "accent",
			toolPendingBg: "toolPendingBg",
			toolSuccessBg: "toolSuccessBg",
			toolErrorBg: "toolErrorBg",
			toolTitle: "accent",
			toolOutput: "toolOutput",

			// Markdown
			mdHeading: "warning",
			mdLink: "link",
			mdLinkUrl: "dim",
			mdCode: "accent",
			mdCodeBlock: "fg",
			mdCodeBlockBorder: "muted",
			mdQuote: "muted",
			mdQuoteBorder: "muted",
			mdHr: "muted",
			mdListBullet: "accent",

			// Diffs
			toolDiffAdded: "success",
			toolDiffRemoved: "error",
			toolDiffContext: "muted",

			// Syntax
			syntaxComment: "muted",
			syntaxKeyword: "accent",
			syntaxFunction: "link",
			syntaxVariable: "accentAlt",
			syntaxString: "success",
			syntaxNumber: "warning",
			syntaxType: "accentAlt",
			syntaxOperator: "fg",
			syntaxPunctuation: "muted",

			// Thinking levels
			thinkingOff: "borderMuted",
			thinkingMinimal: "muted",
			thinkingLow: "link",
			thinkingMedium: "accentAlt",
			thinkingHigh: "accent",
			thinkingXhigh: "warning",
			thinkingMax: "error",

			// Bash mode
			bashMode: "success",
		},
		export: {
			pageBg: isDark ? adjustBrightness(bg, -8) : adjustBrightness(bg, 8),
			cardBg: bg,
			infoBg: mixColors(bg, warning, 0.88),
		},
	};
}
