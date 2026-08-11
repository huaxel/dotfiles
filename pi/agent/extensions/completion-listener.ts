/**
 * completion-listener — async completion notifications for fleet agents.
 *
 * The mother registers the panes of agents she spawned (fleet_watch add).
 * This extension subscribes to herdr's socket event stream
 * (pane.agent_status_changed) for those panes and steers the mother the
 * moment an agent transitions to "done" — no polling, no watcher subagents.
 *
 * - Per-mother by construction: each pi process runs its own instance and
 *   registry; events are matched against this process's registry only.
 * - Survives /reload: the registry is persisted to ~/.pi/fleet-listener.json
 *   and re-subscribed at init and on socket reconnect.
 *
 * Protocol: herdr speaks newline-delimited JSON over a unix socket
 * (HERDR_SOCKET_PATH). Subscription: { type: "pane.agent_status_changed",
 * pane_id } → subscription_started; events arrive as
 * { event: "pane.agent_status_changed", data: { pane_id, agent_status, ... } }.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createConnection, type Socket } from "node:net";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REGISTRY_FILE = join(homedir(), ".pi", "fleet-listener.json");
const DONE_STATUS = "done";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

type RegistryEntry = { name: string; paneId: string; delivered: boolean };

export default function (pi: ExtensionAPI) {
  const socketPath = process.env.HERDR_SOCKET_PATH;
  const inHerdr = process.env.HERDR_ENV === "1" && !!socketPath;

  let registry = new Map<string, RegistryEntry>();
  let socket: Socket | null = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let subscribedPanes = new Set<string>();

  /* ── Persistence ── */
  function saveRegistry() {
    try {
      mkdirSync(join(homedir(), ".pi"), { recursive: true });
      writeFileSync(REGISTRY_FILE, JSON.stringify([...registry.values()], null, 2), "utf8");
    } catch {
      // non-fatal
    }
  }

  function loadRegistry() {
    try {
      if (!existsSync(REGISTRY_FILE)) return;
      const raw = JSON.parse(readFileSync(REGISTRY_FILE, "utf8")) as RegistryEntry[];
      for (const e of raw) {
        if (e && typeof e.name === "string" && typeof e.paneId === "string" && !e.delivered) {
          registry.set(e.paneId, { name: e.name, paneId: e.paneId, delivered: false });
        }
      }
    } catch {
      // non-fatal: start empty
    }
  }

  /* ── Socket protocol ── */
  function send(line: object) {
    if (socket && socket.writable) socket.write(JSON.stringify(line) + "\n");
  }

  function subscribePane(paneId: string) {
    if (subscribedPanes.has(paneId)) return;
    subscribedPanes.add(paneId);
    send({ id: `sub-${paneId}`, method: "events.subscribe", params: { subscriptions: [{ type: "pane.agent_status_changed", pane_id: paneId }] } });
  }

  function connect() {
    if (!inHerdr || socket) return;
    const client = createConnection(socketPath);
    socket = client;
    let buffer = "";

    client.on("connect", () => {
      reconnectDelay = RECONNECT_BASE_MS;
      subscribedPanes.clear();
      for (const entry of registry.values()) subscribePane(entry.paneId);
    });

    client.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg: { event?: string; data?: { pane_id?: string; agent_status?: string; agent?: string | null } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.event === "pane.agent_status_changed" && msg.data) {
          handleStatusChange(msg.data.pane_id, msg.data.agent_status);
        }
      }
    });

    client.on("close", () => {
      socket = null;
      subscribedPanes.clear();
      if (!inHerdr) return;
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    });

    client.on("error", () => {
      // close handler schedules the reconnect
    });
  }

  /* ── Completion handling ── */
  function handleStatusChange(paneId: string | undefined, status: string | undefined) {
    if (!paneId || status !== DONE_STATUS) return;
    const entry = registry.get(paneId);
    if (!entry || entry.delivered) return;
    entry.delivered = true;
    registry.delete(paneId);
    subscribedPanes.delete(paneId);
    saveRegistry();
    pi.sendMessage(
      {
        customType: "fleet_completion",
        content: `Fleet agent "${entry.name}" (pane ${entry.paneId}) is done.`,
        display: true,
        details: { name: entry.name, paneId: entry.paneId },
      },
      { triggerTurn: true, deliverAs: "steer" },
    );
  }

  function addToRegistry(name: string, paneId: string) {
    registry.set(paneId, { name, paneId, delivered: false });
    saveRegistry();
    subscribePane(paneId);
    // If the agent already completed, deliver immediately.
    void checkCurrentStatus(paneId);
  }

  async function checkCurrentStatus(paneId: string) {
    const { execFile } = await import("node:child_process");
    execFile("herdr", ["agent", "get", paneId], { encoding: "utf8" }, (err, stdout) => {
      if (err) return;
      try {
        const d = JSON.parse(stdout);
        const status = d?.result?.agent?.agent_status;
        handleStatusChange(paneId, status);
      } catch {
        // ignore
      }
    });
  }

  /* ── Init ── */
  loadRegistry();
  connect();

  /* ── Tool: fleet_watch ── */
  pi.registerTool({
    name: "fleet_watch",
    label: "Fleet Watch",
    description:
      "Register or unregister fleet agents for async completion notifications. After starting a worktree agent with herdr agent start, call fleet_watch add with the agent name and pane_id: the mother is steered the moment that agent reports 'done'. Registry survives reloads. Requires HERDR_ENV=1.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("add", { description: "Track an agent pane for completion" }),
        Type.Literal("remove", { description: "Stop tracking a pane" }),
        Type.Literal("list", { description: "Show tracked panes" }),
        Type.Literal("clear", { description: "Clear all tracked panes" }),
      ]),
      name: Type.Optional(Type.String({ description: "Agent name (for add)" })),
      paneId: Type.Optional(Type.String({ description: "Herdr pane id (for add/remove)" })),
    }),
    execute: async (_toolCallId, params) => {
      if (!inHerdr) {
        return { content: [{ type: "text", text: "fleet_watch requires HERDR_ENV=1 and HERDR_SOCKET_PATH." }] };
      }
      const action = params.action;
      if (action === "add") {
        if (!params.name || !params.paneId) {
          return { content: [{ type: "text", text: "fleet_watch add requires name and paneId." }] };
        }
        addToRegistry(params.name, params.paneId);
        return { content: [{ type: "text", text: `Tracking "${params.name}" (${params.paneId}); will steer on done.` }] };
      }
      if (action === "remove") {
        if (!params.paneId) return { content: [{ type: "text", text: "fleet_watch remove requires paneId." }] };
        registry.delete(params.paneId);
        subscribedPanes.delete(params.paneId);
        saveRegistry();
        return { content: [{ type: "text", text: `Stopped tracking ${params.paneId}.` }] };
      }
      if (action === "clear") {
        registry.clear();
        subscribedPanes.clear();
        saveRegistry();
        return { content: [{ type: "text", text: "Cleared all tracked panes." }] };
      }
      const lines = [...registry.values()].map((e) => `${e.name} (${e.paneId})`).join("\n") || "(none)";
      return { content: [{ type: "text", text: lines }] };
    },
  });
}
