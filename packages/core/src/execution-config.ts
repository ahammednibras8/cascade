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

function parseRetryConfig(value: unknown): TaskRetryConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const maxAttempts = value["maxAttempts"];
  const delayMs = value["delayMs"];
  const exponentialBackoff = value["exponentialBackoff"];

  if (
    !isPositiveInteger(maxAttempts) ||
    !isNonNegativeInteger(delayMs) ||
    typeof exponentialBackoff !== "boolean"
  ) {
    return null;
  }

  return {
    maxAttempts,
    delayMs,
    exponentialBackoff,
  };
}

function parseQueueConfig(value: unknown): TaskQueueConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = value["name"];
  const concurrencyLimit = value["concurrencyLimit"];

  if (
    typeof name !== "string" ||
    !name.trim() ||
    (concurrencyLimit !== null && !isPositiveInteger(concurrencyLimit))
  ) {
    return null;
  }

  return {
    name: name.trim(),
    concurrencyLimit,
  };
}

export function parseTaskExecutionConfig(value: unknown): TaskExecutionConfig | null {
  if (!isRecord(value) || value["schemaVersion"] !== 1) {
    return null;
  }

  const timeoutMs = value["timeoutMs"];

  if (timeoutMs !== null && !isPositiveInteger(timeoutMs)) {
    return null;
  }

  const retry = parseRetryConfig(value["retry"]);
  const queue = parseQueueConfig(value["queue"]);

  if (!retry || !queue) {
    return null;
  }

  return {
    schemaVersion: 1,
    timeoutMs,
    retry,
    queue,
  };
}
