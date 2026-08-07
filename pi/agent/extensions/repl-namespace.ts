import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * REPL Namespace — tells the model what is actually live in the shared REPL.
 *
 * Companion to `pi-repl` (MIT, omaclaren), which gives pi a persistent
 * tmux-backed Python/IPython session. Variables in that REPL survive across
 * turns and across compaction — but the KNOWLEDGE that they exist lives in the
 * context window, which is exactly what compaction destroys.
 *
 * pi-repl is honest about the consequence in its own tool guidelines:
 *
 *     "This is a shared long-lived session: inspect state before mutating it,
 *      and do not assume variables already exist."
 *
 * So the model must probe before every use, or redefine what it already has.
 * Prime Agent hits the same wall and answers it with a prompt note asking the
 * model to write its own variable names into the compaction summary — a
 * request, not a mechanism. If the summariser forgets a name, the object stays
 * live in memory and invisible forever.
 *
 * This makes it mechanical instead. Before each turn the extension asks the
 * kernel what it is holding and injects the answer into the system prompt, so
 * "what is in scope" is a fact the model cannot lose rather than something it
 * is asked to remember.
 *
 * How the probe works: Node writes a small Python script to a temp file, sends
 * one short `exec(open(...).read())` line to the tmux pane, and reads the JSON
 * the script writes back. Nothing parses tmux pane output, so prompts, echo,
 * and ANSI escapes cannot corrupt the result.
 *
 * The probe only runs when the namespace may have changed — first turn, then
 * after any `repl_send`. Idle turns cost nothing and add no noise to the shared
 * REPL that the user may be attached to.
 *
 * Requires: pi-repl installed, and a session started with `/repl ipython`
 * (or `/repl python`). Silent no-op when no session is running.
 */

/** tmux session name pi-repl uses for its default Python/IPython session. */
const SESSION = "pi-repl-python";
const PANE = `${SESSION}:0.0`;
/** How long to wait for the kernel to write the probe result. */
const PROBE_TIMEOUT_MS = 4_000;
const PROBE_POLL_MS = 100;
/** Names past this many are summarised as a count rather than listed. */
const MAX_LISTED = 40;

const workDir = (): string => join(tmpdir(), "pi-repl-namespace");
const probeScriptPath = (): string => join(workDir(), "probe.py");
const probeResultPath = (): string => join(workDir(), "namespace.json");

/**
 * Written to disk and exec'd inside the kernel. Reports user-defined names
 * only: modules, IPython plumbing, and dunders are noise the model already
 * assumes. Size hints are best-effort — a hostile __len__ must not break it.
 */
const PROBE_SCRIPT = `
import json as _pj, inspect as _pi, types as _pt

_pskip = {"In", "Out", "exit", "quit", "get_ipython", "open"}

def _psize(v):
    try:
        shape = getattr(v, "shape", None)
        if shape is not None:
            return "x".join(str(d) for d in shape)
    except Exception:
        pass
    try:
        if hasattr(v, "__len__") and not isinstance(v, (str, bytes)):
            return str(len(v))
    except Exception:
        pass
    return None

_pout = {}
for _pk, _pv in list(globals().items()):
    if _pk.startswith("_") or _pk in _pskip or _pk.startswith("_p"):
        continue
    if _pi.ismodule(_pv):
        continue
    try:
        if isinstance(_pv, (_pt.FunctionType, _pt.MethodType)) or _pi.isclass(_pv):
            _pout[_pk] = {"kind": "callable", "type": type(_pv).__name__}
            continue
        _pout[_pk] = {"kind": "value", "type": type(_pv).__name__, "size": _psize(_pv)}
    except Exception:
        _pout[_pk] = {"kind": "value", "type": "?", "size": None}

with open(${JSON.stringify(join(tmpdir(), "pi-repl-namespace", "namespace.json"))}, "w") as _pf:
    _pj.dump(_pout, _pf, default=str)

del _pj, _pi, _pt, _pskip, _psize, _pout, _pk, _pv, _pf
`;

interface NamespaceEntry {
  kind: "value" | "callable";
  type: string;
  size?: string | null;
}

type Namespace = Record<string, NamespaceEntry>;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function sessionRunning(pi: ExtensionAPI, cwd: string): Promise<boolean> {
  try {
    const result = await pi.exec("tmux", ["has-session", "-t", SESSION], { cwd, timeout: 3_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Ask the kernel what it is holding. Returns undefined when the session is
 * absent or the probe does not come back — never stale data, because claiming
 * a variable is live when it is not is worse than saying nothing.
 */
async function probe(pi: ExtensionAPI, cwd: string): Promise<Namespace | undefined> {
  if (!(await sessionRunning(pi, cwd))) return undefined;

  mkdirSync(workDir(), { recursive: true });
  writeFileSync(probeScriptPath(), PROBE_SCRIPT, "utf8");
  // Remove any previous result so a stale file cannot be mistaken for a fresh one.
  rmSync(probeResultPath(), { force: true });

  const line = `exec(open(${JSON.stringify(probeScriptPath())}).read())`;
  try {
    await pi.exec("tmux", ["send-keys", "-t", PANE, line, "Enter"], { cwd, timeout: 3_000 });
  } catch {
    return undefined;
  }

  const deadline = Date.now() + PROBE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(PROBE_POLL_MS);
    if (!existsSync(probeResultPath())) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(probeResultPath(), "utf8"));
      if (parsed && typeof parsed === "object") return parsed as Namespace;
    } catch {
      // Written but not yet flushed. Keep waiting.
    }
  }
  return undefined;
}

function formatNamespace(namespace: Namespace): string | undefined {
  const names = Object.keys(namespace);
  if (names.length === 0) return undefined;

  const values = names.filter((name) => namespace[name].kind === "value").sort();
  const callables = names.filter((name) => namespace[name].kind === "callable").sort();

  const lines = [
    "# Live REPL namespace",
    "",
    `These names are ALREADY DEFINED in the shared \`${SESSION}\` session and survive across turns and compaction.`,
    "Reuse them via `repl_send` instead of recomputing or re-reading their sources. This listing is refreshed automatically; trust it over your recollection.",
    "",
  ];

  for (const name of values.slice(0, MAX_LISTED)) {
    const entry = namespace[name];
    const size = entry.size ? `, ${entry.size}` : "";
    lines.push(`- \`${name}\` — ${entry.type}${size}`);
  }
  if (values.length > MAX_LISTED) {
    lines.push(`- …and ${values.length - MAX_LISTED} more values (use \`%whos\` to inspect)`);
  }
  if (callables.length > 0) {
    lines.push("", `Defined callables: ${callables.map((name) => `\`${name}\``).join(", ")}`);
  }

  return lines.join("\n");
}

export default function replNamespace(pi: ExtensionAPI) {
  /** Last known namespace, and whether it may have gone out of date. */
  let cached: Namespace | undefined;
  let dirty = true;
  let probing = false;

  const refresh = async (ctx: ExtensionContext): Promise<void> => {
    if (probing) return;
    probing = true;
    try {
      const namespace = await probe(pi, ctx.cwd);
      if (namespace) {
        cached = namespace;
        dirty = false;
      } else {
        // No session, or the probe failed. Drop the cache rather than assert
        // that variables from a dead kernel are still available.
        cached = undefined;
      }
    } finally {
      probing = false;
    }
  };

  // Anything sent to the REPL may bind or rebind names.
  pi.on("tool_execution_end", (event) => {
    if (event.toolName === "repl_send") dirty = true;
  });

  // A new session means a new context window; re-probe before the first turn.
  pi.on("session_start", () => {
    dirty = true;
    cached = undefined;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (dirty) await refresh(ctx);
    if (!cached) return;
    const block = formatNamespace(cached);
    if (!block) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });

  pi.registerCommand("namespace", {
    description: "Show what is currently live in the shared REPL namespace",
    handler: async (_args, ctx) => {
      await refresh(ctx);
      if (!cached) {
        ctx.ui.notify(`No live namespace — is a session running? Start one with /repl ipython`, "warning");
        return;
      }
      const block = formatNamespace(cached);
      ctx.ui.notify(block ?? "REPL is running but its namespace is empty", "info");
    },
  });
}
