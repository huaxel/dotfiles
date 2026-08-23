const chains = new Map<string, Promise<void>>();

/** Serialize agy_execute calls that share the same working directory. */
export async function withDirLock<T>(
  dir: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const prev = chains.get(dir) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  chains.set(dir, tail);

  try {
    await waitForTurn(prev, signal);
    return await fn();
  } finally {
    // A cancelled waiter still owns a gate in the chain. Release it so later
    // calls are not stranded behind work that will never run.
    release();
    if (chains.get(dir) === tail) chains.delete(dir);
  }
}

function waitForTurn(prev: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return prev;
  if (signal.aborted) return Promise.reject(new Error("agy was cancelled while waiting"));

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("agy was cancelled while waiting"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    prev.then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
