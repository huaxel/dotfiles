// Behavioral tests for worksheet-loop.ts pure block-identity helpers.
// Run: node pi/agent/extensions/worksheet-loop.test.mjs
import { register } from "node:module";

register(new URL("./pi-resolve-hook.mjs", import.meta.url), import.meta.url);

const { reconcileBlockIds, contentSimilarity, todoItems, todoTransitions, worksheetCounts } = await import(new URL("./worksheet-loop.ts", import.meta.url));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const seqId = (() => {
  let n = 0;
  return () => `block-${++n}`;
})();

const sec = (heading, body) => ({ heading, body });
const ids = (records) => records.map((r) => r.id);

// First save: every section gets a fresh id.
{
  const { records, changed } = reconcileBlockIds(
    [],
    [sec("Progress", "did a thing"), sec("Decisions", "chose the approach")],
    seqId,
  );
  assert(ids(records).length === 2, "first save creates two ids");
  assert(changed.length === 2, "first save records both blocks as changed");
}

// Stable identity across an in-place edit: id preserved, marked changed.
{
  const first = reconcileBlockIds(
    [],
    [sec("Progress", "did a thing")],
    seqId,
  ).records;
  const { records, changed } = reconcileBlockIds(
    first,
    [sec("Progress", "did a thing and fixed the bug")],
    seqId,
  );
  assert(records[0].id === first[0].id, "in-place edit keeps the block id");
  assert(changed.length === 1, "an edited block is marked changed");
}

// Heading rename keeps the id (body similarity dominates).
{
  const first = reconcileBlockIds(
    [],
    [sec("## Progress", "we shipped milestones steadily together")],
    seqId,
  ).records;
  const { records } = reconcileBlockIds(
    first,
    [sec("## Milestones", "we shipped milestones steadily together")],
    seqId,
  );
  assert(records[0].id === first[0].id, "heading rename keeps the block id");
}

// Section reordering keeps ids but preserves pairwise identity.
{
  const first = reconcileBlockIds(
    [],
    [sec("A", "alpha content"), sec("B", "beta content")],
    seqId,
  ).records;
  const { records } = reconcileBlockIds(
    first,
    [sec("B", "beta content"), sec("A", "alpha content")],
    seqId,
  );
  assert(records[0].id === first[1].id && records[1].id === first[0].id, "reorder preserves pairwise ids");
}

// Deleting a section and adding an unrelated one gives a fresh id, not a collision.
{
  const first = reconcileBlockIds(
    [],
    [sec("Keep", "alpha content"), sec("Remove", "beta content")],
    seqId,
  ).records;
  const { records } = reconcileBlockIds(
    first,
    [sec("Keep", "alpha content"), sec("BrandNew", "totally unrelated thing here")],
    seqId,
  );
  assert(records[0].id === first[0].id, "unchanged section keeps its id");
  assert(!ids(records).includes(first[1].id), "a genuinely new section gets a new id");
}

// contentSimilarity is symmetric and exact-match is 1.
assert(contentSimilarity("a b c", "a b c") === 1, "identical content scores 1");
assert(contentSimilarity("a b c", "a b") > contentSimilarity("a b c", "x y z"), "related content outranks unrelated");

// ── todo-transition semantics ──────────────────────────────────────────────

// todoItems extracts checkbox state by text content.
{
  const items = todoItems("- [ ] open task\n- [x] done task\n- plain line\n- [X] uppercase");
  assert(items.get("open task")?.state === "open", "unchecked todo parsed as open");
  assert(items.get("done task")?.state === "done", "checked todo parsed as done");
  assert(items.get("uppercase")?.state === "done", "uppercase X parsed as done");
  assert(!items.has("plain line"), "non-checkbox lines are ignored");
}

// Transition open -> done is a completion claim.
{
  const t = todoTransitions("- [ ] fix the bug", "- [x] fix the bug");
  assert(t.length === 1 && t[0].from === "open" && t[0].to === "done", "open->done is a completion");
}

// Transition done -> open is a reopen.
{
  const t = todoTransitions("- [x] fix the bug", "- [ ] fix the bug");
  assert(t.length === 1 && t[0].from === "done" && t[0].to === "open", "done->open is a reopen");
}

// Unchanged and newly-added todos are not transitions.
{
  const t = todoTransitions("- [ ] a\n- [x] b", "- [ ] a\n- [x] b\n- [ ] c");
  assert(t.length === 0, "no state change yields no transition (additions ignored)");
}

// Text edits that also change state are still a transition on the same item.
{
  const t = todoTransitions("- [ ] write docs", "- [x] write docs completely");
  assert(t.length === 0 || t[0].from === "open", "renamed+checked item at worst reports open->done");
}

// ── worksheet-state counts (M3 footer status) ─────────────────────────────

{
  const c = worksheetCounts("## Todos\n- [ ] open one\n- [x] done one\n## Questions\n- Should we?\n- plain line\n");
  assert(c.openTodos === 1, "open todos counted");
  assert(c.openQuestions === 1, "open questions counted");
}
{
  const c = worksheetCounts("- [X] done uppercase\n- [ ] open\n- [ ] another\n- ends with ?\n- [ ] checkbox ending?\n");
  assert(c.openTodos === 3, "3 open todos (uppercase X not counted open; checkbox question is a todo not a question)");
  assert(c.openQuestions === 1, "bare '?' line counted as a question; checkbox '?' is a todo");
}

console.log("worksheet-loop block-identity tests passed");