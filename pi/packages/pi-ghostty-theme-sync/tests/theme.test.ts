import assert from "node:assert/strict";
import test from "node:test";
import { generatePiTheme, parseGhosttyConfig } from "../theme.ts";

const tokyoNightConfig = `
background = #1a1b26
foreground = #c0caf5
palette = 0=#15161e
palette = 1=#f7768e
palette = 2=#9ece6a
palette = 3=#e0af68
palette = 4=#7aa2f7
palette = 5=#bb9af7
palette = 6=#7dcfff
palette = 7=#a9b1d6
palette = 8=#414868
palette = 15=#c0caf5
palette = 16=#ignored
`;

test("parses Ghostty background, foreground, and supported palette slots", () => {
	const colors = parseGhosttyConfig(tokyoNightConfig);

	assert.equal(colors.background, "#1a1b26");
	assert.equal(colors.foreground, "#c0caf5");
	assert.equal(colors.palette[5], "#bb9af7");
	assert.equal(colors.palette[15], "#c0caf5");
	assert.equal(colors.palette[16], undefined);
});

test("normalizes short hex colors and preserves defaults", () => {
	const colors = parseGhosttyConfig("background=#123\nforeground=abcdef");

	assert.equal(colors.background, "#112233");
	assert.equal(colors.foreground, "#abcdef");
	assert.deepEqual(colors.palette, {});
});

test("generates complete readable theme hierarchy", () => {
	const colors = parseGhosttyConfig(tokyoNightConfig);
	const theme = generatePiTheme(colors, "test-theme") as {
		name: string;
		vars: Record<string, string>;
		colors: Record<string, string>;
	};

	assert.equal(theme.name, "test-theme");
	assert.equal(theme.colors.searchMatchText, "fg");
	assert.equal(theme.colors.userMessageText, "fg");
	assert.equal(theme.colors.customMessageText, "fg");
	assert.equal(theme.colors.toolTitle, "accent");
	assert.equal(theme.colors.toolOutput, "toolOutput");
	assert.equal(theme.colors.mdCodeBlock, "fg");
	assert.equal(theme.vars.toolOutput, "#9ba4c7");
	assert.equal(theme.vars.dim, "#7e84a2");

	const requiredTokens = [
		"accent", "border", "borderAccent", "borderMuted", "success", "error", "warning",
		"muted", "dim", "text", "thinkingText", "selectedBg", "userMessageBg",
		"userMessageText", "customMessageBg", "customMessageText", "customMessageLabel",
		"toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput",
		"mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder",
		"mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet", "toolDiffAdded",
		"toolDiffRemoved", "toolDiffContext", "syntaxComment", "syntaxKeyword",
		"syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType",
		"syntaxOperator", "syntaxPunctuation", "thinkingOff", "thinkingMinimal", "thinkingLow",
		"thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode",
	];

	for (const token of requiredTokens) {
		assert.ok(token in theme.colors, `missing theme token: ${token}`);
	}
});
