import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskRunEvent } from "../src/run-event-outbox.js";

const taskEventCreate = vi.fn<(input: unknown) => Promise<{ id: string }>>();
const runEventOutboxCreate = vi.fn<(input: unknown) => Promise<unknown>>();

const tx = {
  taskEvent: {
    create: taskEventCreate,
  },
  runEventOutbox: {
    create: runEventOutboxCreate,
  },
};

describe("createTaskRunEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    taskEventCreate.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
    });

    runEventOutboxCreate.mockResolvedValue({
      id: 1n,
    });
  });

  it("creates an outbox record for the created task event", async () => {
    const event = await createTaskRunEvent(tx as never, {
      taskRunId: "22222222-2222-4222-8222-222222222222",
      type: "task.run.completed",
      level: "INFO",
      message: "Task run completed successfully",
    });

    expect(event).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
    });

    expect(taskEventCreate).toHaveBeenCalledWith({
      data: {
        taskRunId: "22222222-2222-4222-8222-222222222222",
        type: "task.run.completed",
        level: "INFO",
        message: "Task run completed successfully",
      },
      select: {
        id: true,
      },
    });

    expect(runEventOutboxCreate).toHaveBeenCalledWith({
      data: {
        taskEventId: "33333333-3333-4333-8333-333333333333",
      },
    });
  });
});
