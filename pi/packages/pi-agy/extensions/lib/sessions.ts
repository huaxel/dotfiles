import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat as statFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/** One recorded agy conversation for a working directory. */
export interface AgyConversationEntry {
  conversation_id: string;
  model?: string;
  updated_at: string;
}

export interface AgySessionRecord {
  last_conversation_id?: string;
  last_model?: string;
  updated_at?: string;
  /** Recent conversations for the directory, most recent first. */
  history?: AgyConversationEntry[];
}

const HISTORY_LIMIT = 10;
const LOCK_RETRY_MS = 25;
const LOCK_STALE_MS = 30_000;

type SessionStore = Record<string, AgySessionRecord>;

export function getDefaultStorePath(): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "agy-sessions.json");
}

export interface AgySessionStore {
  getSession(dir: string): Promise<AgySessionRecord | undefined>;
  getHistory(dir: string): Promise<AgyConversationEntry[]>;
  saveSession(dir: string, conversationId: string, model?: string): Promise<void>;
}

/**
 * Create a session store. The optional path (string or lazy resolver) makes
 * persistence testable; the lazy form re-reads `PI_CODING_AGENT_DIR` on each
 * operation.
 */
export function createSessionStore(
  storePath: string | (() => string) = getDefaultStorePath,
): AgySessionStore {
  const resolvePath = (): string => (typeof storePath === "function" ? storePath() : storePath);
  let mutationChain = Promise.resolve();

  async function loadStore(): Promise<SessionStore> {
    try {
      const parsed: unknown = JSON.parse(await readFile(resolvePath(), "utf8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as SessionStore)
        : {};
    } catch {
      return {};
    }
  }

  async function saveStore(store: SessionStore): Promise<void> {
    const target = resolvePath();
    await mkdir(path.dirname(target), { recursive: true });
    const tempPath = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      await chmod(tempPath, 0o600);
      await rename(tempPath, target);
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  }

  async function getSession(dir: string): Promise<AgySessionRecord | undefined> {
    const store = await loadStore();
    return store[path.resolve(dir)];
  }

  async function getHistory(dir: string): Promise<AgyConversationEntry[]> {
    const store = await loadStore();
    const history = store[path.resolve(dir)]?.history;
    return Array.isArray(history)
      ? history
          .filter(
            (entry) =>
              entry &&
              typeof entry.conversation_id === "string" &&
              typeof entry.updated_at === "string",
          )
          .slice()
      : [];
  }

  async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
    const target = resolvePath();
    const lockPath = `${target}.lock`;
    const owner = randomUUID();
    await mkdir(path.dirname(target), { recursive: true });

    while (true) {
      try {
        await mkdir(lockPath);
        await writeFile(path.join(lockPath, "owner"), owner, {
          encoding: "utf8",
          mode: 0o600,
        });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const lockStat = await statFile(lockPath);
          if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
            await rm(lockPath, { recursive: true, force: true });
            continue;
          }
        } catch {
          // The lock disappeared between mkdir and stat; retry immediately.
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }

    try {
      return await fn();
    } finally {
      try {
        if ((await readFile(path.join(lockPath, "owner"), "utf8")) === owner) {
          await rm(lockPath, { recursive: true, force: true });
        }
      } catch {
        // Preserve the operation result if cleanup races with a stale-lock recovery.
      }
    }
  }

  function saveSession(dir: string, conversationId: string, model?: string): Promise<void> {
    const operation = mutationChain.then(() =>
      withStoreLock(async () => {
        const store = await loadStore();
        const key = path.resolve(dir);
        const record = store[key] ?? {};
        const updatedAt = new Date().toISOString();
        store[key] = {
          last_conversation_id: conversationId,
          last_model: model,
          updated_at: updatedAt,
          history: [
            { conversation_id: conversationId, model, updated_at: updatedAt },
            ...(Array.isArray(record.history) ? record.history : []).filter(
              (entry) =>
                entry &&
                typeof entry.conversation_id === "string" &&
                entry.conversation_id !== conversationId,
            ),
          ].slice(0, HISTORY_LIMIT),
        };
        await saveStore(store);
      }),
    );
    mutationChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  return { getSession, getHistory, saveSession };
}

const defaultStore = createSessionStore();

export function getSession(dir: string): Promise<AgySessionRecord | undefined> {
  return defaultStore.getSession(dir);
}

export function getHistory(dir: string): Promise<AgyConversationEntry[]> {
  return defaultStore.getHistory(dir);
}

export function saveSession(
  dir: string,
  conversationId: string,
  model?: string,
): Promise<void> {
  return defaultStore.saveSession(dir, conversationId, model);
}
