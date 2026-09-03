const chains = new Map<string, Promise<void>>();

/**
 * Serialize agy_execute calls that share the same working directory.
 * When `timeoutMs` is set, waiting for the lock counts against the budget
 * so a call queued behind a long run cannot silently exceed its timeout.
 */
export async function withDirLock<T>(
  dir: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  const deadline = timeoutMs ? Date.now() + timeoutMs : undefined;
  const prev = chains.get(dir) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  chains.set(dir, tail);

  try {
    await waitForTurn(prev, signal, deadline);
    return await fn();
  } finally {
    // A cancelled waiter still owns a gate in the chain. Release it so later
    // calls are not stranded behind work that will never run.
    release();
    if (chains.get(dir) === tail) chains.delete(dir);
  }
}

function waitForTurn(prev: Promise<void>, signal?: AbortSignal, deadline?: number): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error("agy was cancelled while waiting"));
  if (deadline !== undefined && Date.now() >= deadline) {
    return Promise.reject(
      new Error("agy timed out waiting for a previous run in the same directory"),
    );
  }
  if (!signal && deadline === undefined) return prev;

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => finish(() => reject(new Error("agy was cancelled while waiting")));
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void) => {
      signal?.removeEventListener("abort", onAbort);
      if (timer !== undefined) clearTimeout(timer);
      settle();
    };

    if (deadline !== undefined) {
      timer = setTimeout(
        () =>
          finish(() =>
            reject(new Error("agy timed out waiting for a previous run in the same directory")),
          ),
        Math.max(deadline - Date.now(), 0),
      );
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    prev.then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    );
  });
}
