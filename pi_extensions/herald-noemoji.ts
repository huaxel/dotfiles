import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Herald No-Emoji companion extension
 *
 * Strips emoji characters from Herald's system prompt and appends a strong
 * override instruction. Only activates when Herald instructions are present.
 */

// Narrowed regex: actual emoji and pictograph blocks only.
// Excludes arrows, math symbols, geometric shapes, and combining marks
// that are not emoji but were in the previous overly-broad regex.
const EMOJI_REGEX =
	/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{3297}\u{3299}\u{3030}\u{00A9}\u{00AE}\u{2122}]/gu;

export default function heraldNoEmoji(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => {
		// Only act when Herald instructions are present
		if (!event.systemPrompt.includes("You are **Herald**")) {
			return;
		}

		// Remove emoji characters from the system prompt
		let systemPrompt = event.systemPrompt.replace(EMOJI_REGEX, "");

		// Add a strong override instruction at the end
		systemPrompt +=
			"\n\n**NO-EMOJI OVERRIDE:** Do not use emojis or Unicode pictographs in any output, including commit messages, PR titles, PR descriptions, headers, or bullets. Use plain text only.";

		return { systemPrompt };
	});
}
