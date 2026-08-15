class TaskTimeoutError extends Error {
  readonly code = "TASK_TIMEOUT";

  constructor(readonly timeoutMs: number) {
    super(`Task exceeded timeout of ${timeoutMs}ms`);
    this.name = "TaskTimeoutError";
  }
}

type RunWithTaskTimeoutInput<TOutput> = {
  timeoutMs: number | null;
  signal?: AbortSignal;
  run: (signal: AbortSignal) => TOutput | Promise<TOutput>;
};

export async function runWithTaskTimeout<TOutput>(input: RunWithTaskTimeoutInput<TOutput>) {
  const abortController = new AbortController();

  const forwardExternalAbort = () => {
    abortController.abort(input.signal?.reason);
  };

  if (input.signal) {
    if (input.signal.aborted) {
      forwardExternalAbort();
    } else {
      input.signal.addEventListener("abort", forwardExternalAbort, {
        once: true,
      });
    }
  }

  let timeout: NodeJS.Timeout | undefined;

  try {
    const taskPromise = Promise.resolve().then(() => input.run(abortController.signal));
    const timeoutMs = input.timeoutMs;

    if (timeoutMs === null) {
      return await taskPromise;
    }

    const timeoutError = new TaskTimeoutError(timeoutMs);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        abortController.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);

      timeout.unref();
    });

    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    input.signal?.removeEventListener("abort", forwardExternalAbort);
  }
}
