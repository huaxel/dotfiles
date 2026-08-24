import assert from "node:assert/strict";
import test from "node:test";
import { applyEditorBackground, liveEditorStyle } from "../editor.ts";

test("live editor uses existing theme background and border tokens", () => {
	assert.deepEqual(liveEditorStyle, {
		background: "userMessageBg",
		border: "borderAccent",
	});
});

test("editor background is restored after nested SGR resets", () => {
	const backgroundPrefix = "\x1b[48;2;46;48;63m";
	const line = `text\x1b[0mcandidate\x1b[49mpadding`;

	assert.equal(
		applyEditorBackground(line, backgroundPrefix),
		`${backgroundPrefix}text\x1b[0m${backgroundPrefix}candidate\x1b[49m${backgroundPrefix}padding\x1b[49m`,
	);
});
