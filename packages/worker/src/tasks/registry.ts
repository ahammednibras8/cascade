import { createTaskRegistry, task } from "@cascade/core";

const helloTask = task({
  id: "hello",
  timeoutMs: 30_000,
  queue: {
    name: "hello",
    concurrencyLimit: 2,
  },
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    exponentialBackoff: true,
  },
  async run({ runId, payload, logger }) {
    await logger.info("Hello task started", {
      runId,
      payload,
    });

    await logger.debug("Hello task preparing output");

    const output = {
      ok: true,
      message: "Hello from local task registry",
      runId,
      payload,
    };

    await logger.info("Hello task completed", {
      output,
    });

    return output;
  },
});

export const taskRegistry = createTaskRegistry([helloTask]);
