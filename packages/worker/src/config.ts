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

export const WORKER_HEALTH_PORT = getPositiveIntegerEnv("WORKER_HEALTH_PORT", 3002);

export const HEALTHCHECK_DEPENDENCY_TIMEOUT_MS = getPositiveIntegerEnv(
  "HEALTHCHECK_DEPENDENCY_TIMEOUT_MS",
  2_000,
);

export const WORKER_HEALTH_HOST = process.env.WORKER_HEALTH_HOST ?? "0.0.0.0";

export const QUEUE_CONCURRENCY_RETRY_MS = getPositiveIntegerEnv("QUEUE_CONCURRENCY_RETRY_MS", 1000);

export const PENDING_RUN_RECOVERY_MS = getPositiveIntegerEnv("PENDING_RUN_RECOVERY_MS", 30_000);

export const PENDING_RUN_SWEEP_INTERVAL_MS = getPositiveIntegerEnv(
  "PENDING_RUN_SWEEP_INTERVAL_MS",
  10_000,
);

export const RUN_EVENT_OUTBOX_DISPATCH_INTERVAL_MS = getPositiveIntegerEnv(
  "RUN_EVENT_OUTBOX_DISPATCH_INTERVAL_MS",
  1_000,
);

export const RUN_EVENT_OUTBOX_LOCK_TIMEOUT_MS = getPositiveIntegerEnv(
  "RUN_EVENT_OUTBOX_LOCK_TIMEOUT_MS",
  30_000,
);

export const TASK_RUN_CANCELLATION_POLL_INTERVAL_MS = getPositiveIntegerEnv(
  "TASK_RUN_CANCELLATION_POLL_INTERVAL_MS",
  500,
);

export type WorkerRole = "control" | "deployment" | "local";

function getWorkerRole(): WorkerRole {
  const role = process.env.CASCADE_WORKER_ROLE ?? "local";

  if (role === "control" || role === "deployment" || role === "local") {
    return role;
  }

  throw new Error("CASCADE_WORKER_ROLE must be control, deployment, or local");
}

export const WORKER_ROLE = getWorkerRole();
