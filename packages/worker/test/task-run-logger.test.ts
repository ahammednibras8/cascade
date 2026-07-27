import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  taskEvent: {
    create: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
}));

const { createTaskLogger } = await import("../src/task-run-logger.js");

describe("createTaskLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.taskEvent.create.mockResolvedValue({
      id: "event-1",
    });
  });

  it("writes structured logs into TaskEvent", async () => {
    const logger = createTaskLogger({
      taskRunId: "run-1",
      taskAttemptId: "attempt-1",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: "3333333333333333",
    });

    await logger.info("Task started", {
      customerId: "customer-1",
      attempt: 1,
      nested: {
        ok: true,
      },
    });

    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskRunId: "run-1",
        taskAttemptId: "attempt-1",
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        parentSpanId: "3333333333333333",
        type: "task.log",
        level: "INFO",
        message: "Task started",
        data: {
          customerId: "customer-1",
          attempt: 1,
          nested: {
            ok: true,
          },
        },
      },
    });
  });

  it("supports all log levels", async () => {
    const logger = createTaskLogger({
      taskRunId: "run-1",
      taskAttemptId: "attempt-1",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: null,
    });

    await logger.debug("debug message");
    await logger.info("info message");
    await logger.warn("warn message");
    await logger.error("error message");

    expect(prisma.taskEvent.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: "task.log",
          level: "DEBUG",
          message: "debug message",
        }),
      }),
    );

    expect(prisma.taskEvent.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: "task.log",
          level: "INFO",
          message: "info message",
        }),
      }),
    );

    expect(prisma.taskEvent.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          type: "task.log",
          level: "WARN",
          message: "warn message",
        }),
      }),
    );

    expect(prisma.taskEvent.create).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.objectContaining({
          type: "task.log",
          level: "ERROR",
          message: "error message",
        }),
      }),
    );
  });

  it("omits data when no structured data is provided", async () => {
    const logger = createTaskLogger({
      taskRunId: "run-1",
      taskAttemptId: "attempt-1",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: null,
    });

    await logger.info("No extra data");

    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskRunId: "run-1",
        taskAttemptId: "attempt-1",
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        parentSpanId: null,
        type: "task.log",
        level: "INFO",
        message: "No extra data",
      },
    });
  });
});
