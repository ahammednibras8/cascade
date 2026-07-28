function getPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer greater than or equal to 1`);
  }

  return value;
}

export const WORKER_CONCURRENCY = getPositiveIntegerEnv("WORKER_CONCURRENCY", 4);

export const QUEUE_CONCURRENCY_RETRY_MS = getPositiveIntegerEnv("QUEUE_CONCURRENCY_RETRY_MS", 1000);

export const PENDING_RUN_RECOVERY_MS = getPositiveIntegerEnv("PENDING_RUN_RECOVERY_MS", 30_000);

export const PENDING_RUN_SWEEP_INTERVAL_MS = getPositiveIntegerEnv(
  "PENDING_RUN_SWEEP_INTERVAL_MS",
  10_000,
);

export const TASK_RUN_CANCELLATION_POLL_INTERVAL_MS = getPositiveIntegerEnv(
  "TASK_RUN_CANCELLATION_POLL_INTERVAL_MS",
  500,
);
