export function createExecutionConfig(queueName = "hello") {
  return {
    schemaVersion: 1,
    timeoutMs: 30_000,
    retry: {
      maxAttempts: 3,
      delayMs: 1000,
      exponentialBackoff: true,
    },
    queue: {
      name: queueName,
      concurrencyLimit: 2,
    },
  };
}
