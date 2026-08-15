import { task } from "@cascade/core";

export default [
  task({
    id: "hello",
    timeoutMs: 30_000,
    queue: {
      name: "hello",
      concurrencyLimit: 2,
    },
    retry: {
      maxAttempts: 3,
      delayMs: 1_000,
      exponentialBackoff: true,
    },
    async run({ runId, payload, logger, signal }) {
      signal.throwIfAborted();

      await logger.info("Hello task started by deployment image", {
        runId,
        payload,
      });

      return {
        ok: true,
        message: "Hello from deployment image",
        runId,
        payload,
      };
    },
  }),
];
