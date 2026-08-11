import { mkdtempSync, readdirSync, readFileSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverAndLoadExtensions } from "/home/juan/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/index.js";

const result = await discoverAndLoadExtensions([], "/home/juan/dotfiles", "/home/juan/.pi/agent");
if (result.errors.length) { console.log("LOAD ERRORS:", result.errors.map(e => e.path + ": " + e.error).join("\n")); process.exit(1); }
const ext = result.extensions.find((e) => e.path.includes("todos.ts"));
const tool = ext.tools.get("todo");
const def = tool.definition;
console.log("definition keys:", Object.keys(def).join(", "));
console.log("def.name:", def.name, "| def.execute:", typeof def.execute);
if (typeof def.execute !== "function") process.exit(1);

const tmp = mkdtempSync(path.join(tmpdir(), "todos-test-"));
const td = path.join(tmp, ".pi", "todos");
const ctx = {
  cwd: tmp,
  hasUI: false,
  sessionManager: { getSessionId: () => "test-session", getSessionFile: () => path.join(tmp, "session.json") },
  ui: { notify: () => {}, confirm: async () => true },
};
const run = (params) => def.execute("call1", params, new AbortController().signal, () => {}, ctx);
const assert = (cond, msg) => { if (!cond) { console.log("FAIL:", msg); process.exit(1); } console.log("ok:", msg); };

const a = await run({ action: "create", title: "Add tests", tags: ["qa"], body: "write tests" });
assert(a.details.action === "create" && !a.details.error, "create #1");
const aId = a.details.todo.id;
const b = await run({ action: "create", title: "Ship feature", tags: ["dev"] });
assert(b.details.action === "create", "create #2");
const bId = b.details.todo.id;

let r = await run({ action: "list" });
assert(r.details.todos.length === 2, "list returns 2 open todos");
r = await run({ action: "list", tag: "qa" });
assert(r.details.todos.length === 1 && r.details.todos[0].id === aId, "list filter by tag");
r = await run({ action: "list-all", status: "closed" });
assert(r.details.todos.length === 0, "list-all status=closed -> 0");
r = await run({ action: "list", query: "ship" });
assert(r.details.todos.length === 1 && r.details.todos[0].id === bId, "list fuzzy query");
r = await run({ action: "list-all", limit: 1 });
assert(r.details.todos.length === 1, "list-all limit=1");

r = await run({ action: "claim", id: aId });
assert(r.details.todo.assigned_to_session === "test-session", "claim assigns session");
// same session re-claim is a no-op success
r = await run({ action: "claim", id: aId });
assert(!r.details.error, "re-claim by owner is idempotent");
// another session cannot claim without force
const ctx2 = { ...ctx, sessionManager: { getSessionId: () => "other-session", getSessionFile: () => path.join(tmp, "session2.json") } };
const run2 = (params) => def.execute("call1", params, new AbortController().signal, () => {}, ctx2);
r = await run2({ action: "claim", id: aId });
assert(r.details.error && r.details.error.includes("already assigned"), "claim without force refuses other session");
r = await run2({ action: "claim", id: aId, force: true });
assert(!r.details.error && r.details.todo.assigned_to_session === "other-session", "claim with force takes over");
r = await run({ action: "claim", id: aId, force: true });
assert(!r.details.error && r.details.todo.assigned_to_session === "test-session", "original session force reclaims");

const old = Date.now() - 40 * 60 * 1000;
const lockPath = path.join(td, aId + ".lock");
writeFileSync(lockPath, JSON.stringify({ id: aId, pid: 999, session: "other", created_at: new Date(old).toISOString() }));
utimesSync(lockPath, new Date(old), new Date(old));
r = await run({ action: "update", id: aId, status: "closed", force: true });
assert(!r.details.error, "force update steals stale lock");
assert(!readdirSync(td).some((f) => f.endsWith(".lock")), "stale lock removed after steal");

const lockPath2 = path.join(td, bId + ".lock");
writeFileSync(lockPath2, JSON.stringify({ id: bId, pid: 999, session: "other", created_at: new Date().toISOString() }));
r = await run({ action: "update", id: bId, title: "x" });
assert(r.details.error && r.details.error.includes("locked"), "fresh lock refuses update");
r = await run({ action: "update", id: bId, title: "x", force: true });
assert(r.details.error && r.details.error.includes("locked"), "force does not steal fresh lock");
writeFileSync(lockPath2, JSON.stringify({ id: bId, pid: 999, session: "other", created_at: new Date().toISOString() }));
utimesSync(lockPath2, new Date(old), new Date(old));
r = await run({ action: "update", id: bId, title: "x", force: true });
assert(!r.details.error, "stale lock stolen with force");

r = await run({ action: "release", id: bId });
assert(r.details.todo.assigned_to_session === undefined, "release clears assignment");
r = await run({ action: "delete", id: aId });
assert(r.details.action === "delete" && !r.details.error, "delete works");
assert(!readdirSync(td).includes(aId + ".md"), "todo file removed");

const bFile = readFileSync(path.join(td, bId + ".md"), "utf8");
assert(bFile.startsWith("{") && bFile.includes('"title": "x"') && bFile.includes('"status": "open"'), "markdown file with JSON front matter");

// --- updated_at + due ---
const c1 = await run({ action: "create", title: "Due later" });
const c2 = await run({ action: "create", title: "Due soon", due: "2026-08-01" });
assert(c1.details.todo.updated_at, "create sets updated_at");
const upd1 = await run({ action: "update", id: c1.details.todo.id, title: "Due later (edited)" });
assert(upd1.details.todo.updated_at >= c1.details.todo.updated_at, "update refreshes updated_at");
r = await run({ action: "list" });
const dueSoonFirst = r.details.todos[0].id === c2.details.todo.id;
assert(dueSoonFirst, "open todos sort by due asc (dated before undated)");
r = await run({ action: "get", id: c2.details.todo.id });
assert(r.details.todo.due === "2026-08-01", "due persisted in front matter");

// --- validate + repair ---
const good = await run({ action: "create", title: "Healthy" });
const badId = "deadbeef";
writeFileSync(path.join(td, badId + ".md"), "# broken todo\n\nno front matter here\n");
r = await run({ action: "validate" });
assert(r.details.action === "validate" && r.details.issues === 1, "validate reports 1 issue");
assert(r.details.repaired === 0, "validate without repair does nothing");
r = await run({ action: "validate", repair: true });
assert(r.details.repaired === 1, "validate repair fixes 1 file");
const fixed = readFileSync(path.join(td, badId + ".md"), "utf8");
assert(fixed.startsWith("{") && fixed.includes('"(untitled)"'), "repaired file has JSON front matter");
const backups = readdirSync(path.join(td, ".trash", "backups"));
assert(backups.some((f) => f.startsWith(badId)), "original backed up before repair");
r = await run({ action: "validate" });
assert(r.details.issues === 0, "validate clean after repair");
// --- configurable lock TTL ---
writeFileSync(path.join(td, "settings.json"), JSON.stringify({ gc: true, gcDays: 7, lockTtlMs: 5000 }));
const ttlTodo = await run({ action: "create", title: "TTL test" });
const ttlId = ttlTodo.details.todo.id;
const ttlLock = path.join(td, ttlId + ".lock");
const ttlOld = Date.now() - 20 * 1000;
writeFileSync(ttlLock, JSON.stringify({ id: ttlId, pid: 1, session: "x", created_at: new Date(ttlOld).toISOString() }));
utimesSync(ttlLock, new Date(ttlOld), new Date(ttlOld));
r = await run({ action: "update", id: ttlId, title: "steal via short ttl", force: true });
assert(!r.details.error, "lockTtlMs from settings applies (20s old lock stale with 5s TTL)");
await run({ action: "delete", id: ttlId });

// cleanup extra todos
await run({ action: "delete", id: c1.details.todo.id });
await run({ action: "delete", id: c2.details.todo.id });
await run({ action: "delete", id: good.details.todo.id });
await run({ action: "delete", id: badId });

console.log("\nALL TODOS TESTS PASSED");
process.exit(0);
