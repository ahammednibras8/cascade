import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  taskEvent: {
    create: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
}));

const createTaskRunEvent = vi.hoisted(() =>
  vi.fn<(tx: unknown, data: unknown) => Promise<{ id: string }>>(),
);

vi.mock("@cascade/database", () => ({
  Prisma: {},
  prisma,
  createTaskRunEvent,
}));

const { createTaskLogger } = await import("../src/task-run-logger.js");

describe("createTaskLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createTaskRunEvent.mockResolvedValue({
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

    expect(createTaskRunEvent).toHaveBeenCalledWith(prisma, {
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

    expect(createTaskRunEvent).toHaveBeenNthCalledWith(
      1,
      prisma,
      expect.objectContaining({
        type: "task.log",
        level: "DEBUG",
        message: "debug message",
      }),
    );

    expect(createTaskRunEvent).toHaveBeenNthCalledWith(
      2,
      prisma,
      expect.objectContaining({
        type: "task.log",
        level: "INFO",
        message: "info message",
      }),
    );

    expect(createTaskRunEvent).toHaveBeenNthCalledWith(
      3,
      prisma,
      expect.objectContaining({
        type: "task.log",
        level: "WARN",
        message: "warn message",
      }),
    );

    expect(createTaskRunEvent).toHaveBeenNthCalledWith(
      4,
      prisma,
      expect.objectContaining({
        type: "task.log",
        level: "ERROR",
        message: "error message",
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

    expect(createTaskRunEvent).toHaveBeenCalledWith(prisma, {
      taskRunId: "run-1",
      taskAttemptId: "attempt-1",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: null,
      type: "task.log",
      level: "INFO",
      message: "No extra data",
    });
  });
});
