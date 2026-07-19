import { createTaskRegistry, task } from "@cascade/core";

const helloTask = task({
  id: "hello",
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    exponentialBackoff: true,
  },
  async run({ runId, payload }) {
    return {
      ok: true,
      message: "Hello from local task registry",
      runId,
      payload,
    };
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
