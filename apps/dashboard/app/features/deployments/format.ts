import type { ExecutionConfig } from "./types";

export function formatDeploymentDate(
  value: string | null,
  timeStyle: "short" | "medium" = "medium",
) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle,
  }).format(new Date(value));
}

export function executionConfigSummary(config: ExecutionConfig | null) {
  if (!config) {
    return "No execution configuration";
  }

  const timeout = config.timeoutMs === null ? "No timeout" : `${config.timeoutMs} ms`;
  const concurrency =
    config.queue.concurrencyLimit === null
      ? "No concurrency limit"
      : `Concurrency ${config.queue.concurrencyLimit}`;

  return [
    `Timeout ${timeout}`,
    `Attempts ${config.retry.maxAttempts}`,
    `Delay ${config.retry.delayMs} ms`,
    config.retry.exponentialBackoff ? "Exponential backoff" : "Fixed retry delay",
    `Queue ${config.queue.name}`,
    concurrency,
  ].join(" · ");
}
