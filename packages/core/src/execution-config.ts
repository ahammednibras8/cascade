import type { TaskQueueConfig, TaskRetryConfig } from "./task.js";

export type TaskExecutionConfig = {
  schemaVersion: 1;
  timeoutMs: number | null;
  retry: TaskRetryConfig;
  queue: TaskQueueConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseTaskExecutionConfig(value: unknown): TaskExecutionConfig | null {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }

  if (value.timeoutMs !== null && !isPositiveInteger(value.timeoutMs)) {
    return null;
  }

  if (!isRecord(value.retry) || !isRecord(value.queue)) {
    return null;
  }

  if (
    !isPositiveInteger(value.retry.maxAttempts) ||
    !isNonNegativeInteger(value.retry.delayMs) ||
    typeof value.retry.exponentialBackoff !== "boolean"
  ) {
    return null;
  }

  if (
    typeof value.queue.name !== "string" ||
    !value.queue.name.trim() ||
    (value.queue.concurrencyLimit !== null && !isPositiveInteger(value.queue.concurrencyLimit))
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    timeoutMs: value.timeoutMs,
    retry: {
      maxAttempts: value.retry.maxAttempts,
      delayMs: value.retry.delayMs,
      exponentialBackoff: value.retry.exponentialBackoff,
    },
    queue: {
      name: value.queue.name.trim(),
      concurrencyLimit: value.queue.concurrencyLimit,
    },
  };
}
