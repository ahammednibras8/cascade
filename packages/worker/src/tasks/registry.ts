import { createTaskRegistry, task } from "@cascade/core";

const helloTask = task({
  id: "hello",
  async run({ runId, payload }) {
    return {
      ok: true,
      message: "Hello from local task registry",
      runId,
      payload,
    };
  },
});

export const taskRegistry = createTaskRegistry([helloTask]);
