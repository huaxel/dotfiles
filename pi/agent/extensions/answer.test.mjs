// Behavioral tests for answer.ts pure helpers. Run: node pi/agent/extensions/answer.test.mjs
// (from the repo root). Registers a resolve hook so @earendil-works/* packages
// resolve from the pi install; no pi install needed beyond that.
import { registerHooks } from "node:module";
import { resolve } from "./pi-resolve-hook.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

registerHooks({ resolve });

const { parseExtractionResult, toExtractedQuestion, questionsMatch, loadAnswerDraft, saveAnswerDraft } =
	await import(new URL("./answer.ts", import.meta.url));

const assert = (cond, msg) => {
	if (!cond) {
		console.log("FAIL:", msg);
		process.exit(1);
	}
	console.log("ok:", msg);
};

assert(toExtractedQuestion({ question: "A?" })?.question === "A?", "plain question");
assert(toExtractedQuestion({ question: "A?", context: "ctx" })?.context === "ctx", "context kept");
assert(
	toExtractedQuestion({ question: "A?", options: ["X", "Y"] })?.options?.length === 2,
	"options parsed",
);
assert(
	toExtractedQuestion({ question: "A?", options: ["only"] }).options === undefined,
	"single option dropped",
);
const capped = toExtractedQuestion({
	question: "A?",
	options: ["1", "2", "3", "4", "5", "6", "7", "8"],
});
assert(capped.options.length === 6, "options capped at 6");
const mixed = toExtractedQuestion({ question: "A?", options: ["ok", 42, "", "yes"] });
assert(mixed.options.length === 2 && mixed.options[0] === "ok", "non-string options filtered");
assert(toExtractedQuestion(null) === null, "null rejected");
assert(toExtractedQuestion({}) === null, "missing question rejected");
assert(
	toExtractedQuestion({ question: "A?", options: "nope" })?.options === undefined,
	"non-array options ignored",
);

const fenced = '```json\n{"questions":[{"question":"DB?","options":["MySQL","PG"]}]}\n```';
const r1 = parseExtractionResult(fenced);
assert(
	r1?.questions?.length === 1 && r1.questions[0].options[0] === "MySQL",
	"fenced json parsed with options",
);
const r2 = parseExtractionResult('Sure! {"questions": [{"question": "A?"}]}');
assert(r2?.questions?.length === 1, "inline braces parsed");
const r3 = parseExtractionResult('{"questions": []}');
assert(r3?.questions?.length === 0, "empty questions parsed");
assert(parseExtractionResult("no json here") === null, "garbage returns null");
assert(parseExtractionResult('{"questions": [{"nope": 1}]}') === null, "invalid entry returns null");
const r4 = parseExtractionResult('{"questions":[{"question":"A?"},{"question":"B?","context":"c"}]}');
assert(
	r4?.questions?.length === 2 && r4.questions[1].context === "c",
	"multi-question order kept",
);

const tmpDir = mkdtempSync(path.join(tmpdir(), "answer-draft-"));
const draftPath = path.join(tmpDir, "draft.json");
const qs = [{ question: "A?" }, { question: "B?" }];
await saveAnswerDraft(draftPath, qs, ["answer a", ""]);
assert(questionsMatch(qs, [{ question: "A?" }, { question: "B?" }]), "matching draft questions accepted");
assert(!questionsMatch(qs, [{ question: "A?" }, { question: "C?" }]), "different draft questions rejected");
const draft = await loadAnswerDraft(draftPath);
assert(draft?.answers?.length === 2 && draft.answers[0] === "answer a", "draft roundtrip");
assert(await loadAnswerDraft(path.join(tmpDir, "missing.json")) === null, "missing draft returns null");
writeFileSync(draftPath, "not json");
assert(await loadAnswerDraft(draftPath) === null, "corrupt draft returns null");
rmSync(tmpDir, { recursive: true, force: true });

console.log("\nALL ANSWER TESTS PASSED");
process.exit(0);
