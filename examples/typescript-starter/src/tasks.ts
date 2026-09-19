import { defineTask } from "@ahammednibras8/cascade";

export const hello = defineTask<{ name: string }>({
  id: "hello",
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 3,
    delayMs: 1_000,
    exponentialBackoff: true,
  },
  queue: {
    name: "hello",
    concurrencyLimit: 2,
  },
  async run({ runId, payload, logger, signal }) {
    signal.throwIfAborted();

    const name = payload?.name.trim() || "world";

    await logger.info("Creating greeting", {
      runId,
      name,
    });

    return {
      message: `Hello, ${name}!`,
      runId,
    };
  },
});

export default [hello];
