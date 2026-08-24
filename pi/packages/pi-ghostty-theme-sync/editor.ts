/**
 * Theme tokens used by the live prompt editor.
 *
 * These are existing Pi tokens so the editor stays synchronized with the
 * Ghostty-derived theme without requiring an unsupported editorBg token.
 */
export const liveEditorStyle = {
	background: "userMessageBg",
	border: "borderAccent",
} as const;

export type LiveEditorStyle = typeof liveEditorStyle;

/**
 * Keep the editor surface active after cursor/autocomplete SGR resets.
 *
 * `backgroundPrefix` is supplied by Pi's Theme.bg(token, "") so this helper
 * remains independent of Pi's runtime package and can be tested directly.
 */
export function applyEditorBackground(line: string, backgroundPrefix: string): string {
	const backgroundReset = "\x1b[49m";
	const withBackgroundRestored = line.replaceAll(
		/\x1b\[(?:0|49)m/g,
		(reset) => `${reset}${backgroundPrefix}`,
	);
	return `${backgroundPrefix}${withBackgroundRestored}${backgroundReset}`;
}
