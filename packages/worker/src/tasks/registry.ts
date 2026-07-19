import { createTaskRegistry, task } from "@cascade/core";

const helloTask = task({
  id: "hello",
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

// Testing Failure:
// const helloTask = task({
//   id: "hello",
//   retry: {
//     maxAttempts: 3,
//     delayMs: 1000,
//     exponentialBackoff: true,
//   },
//   async run() {
//     throw new Error("Testing retry");
//   }
// })

export const taskRegistry = createTaskRegistry([helloTask]);
