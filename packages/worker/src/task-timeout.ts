export class TaskTimeoutError extends Error {
  readonly code = "TASK_TIMEOUT";

  constructor(readonly timeoutMs: number) {
    super(`Task exceeded timeout of ${timeoutMs}ms`);
    this.name = "TaskTimeoutError";
  }
}

export function isTaskTimeoutError(error: unknown): error is TaskTimeoutError {
  return error instanceof TaskTimeoutError;
}

type RunWithTaskTimeoutInput<TOutput> = {
  timeoutMs: number | null;
  run: (signal: AbortSignal) => TOutput | Promise<TOutput>;
};

export async function runWithTaskTimeout<TOutput>(input: RunWithTaskTimeoutInput<TOutput>) {
  const abortController = new AbortController();
  const timeoutMs = input.timeoutMs;

  if (timeoutMs === null) {
    return input.run(abortController.signal);
  }

  const timeoutError = new TaskTimeoutError(timeoutMs);

  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      abortController.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);

    timeout.unref();
  });

  const taskPromise = Promise.resolve(input.run(abortController.signal));

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
