import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRunQueueMessage } from "./queue/task-runs.js";

const RUN_ID = "run-1";
const TASK_ID = "task-1";
const ENVIRONMENT_ID = "environment-1";
const ATTEMPT_ID = "attempt-1";
const TRACE_ID = "11111111111111111111111111111111";
const SPAN_ID = "2222222222222222";
const PARENT_SPAN_ID = "3333333333333333";

type TransactionClient = {
  taskRun: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  taskAttempt: {
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<{ id: string; attemptNumber: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
  taskEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

const localTaskRun = vi.hoisted(() => vi.fn<(context: unknown) => Promise<unknown>>());

const prisma = vi.hoisted(() => ({
  taskRun: {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  },
  $transaction: vi.fn<<T>(callback: TransactionCallback<T>) => Promise<T>>(),
}));

const txTaskRunUpdateMany = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ count: number }>>(),
);

const txTaskAttemptCount = vi.hoisted(() => vi.fn<(args: unknown) => Promise<number>>());

const txTaskAttemptCreate = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ id: string; attemptNumber: number }>>(),
);

const txTaskAttemptUpdate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const txTaskEventCreate = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

const enqueueTaskRun = vi.hoisted(() =>
  vi.fn<(message: TaskRunQueueMessage, options?: unknown) => Promise<void>>(),
);

const resolveJsonValue = vi.hoisted(() => vi.fn<(value: unknown) => Promise<unknown>>());

const maybeStoreJsonValue = vi.hoisted(() =>
  vi.fn<(input: { value: unknown }) => Promise<unknown>>(),
);

const stopHeartbeat = vi.hoisted(() => vi.fn<() => void>());
const startTaskRunHeartbeat = vi.hoisted(() => vi.fn<(taskRunId: string) => () => void>());

const stopQueueConcurrencyHeartbeat = vi.hoisted(() => vi.fn<() => void>());
const startQueueConcurrencyLeaseHeartbeat = vi.hoisted(() =>
  vi.fn<(lease: unknown) => () => void>(),
);

const tryAcquireQueueConcurrency = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());

const releaseQueueConcurrency = vi.hoisted(() => vi.fn<(lease: unknown) => Promise<void>>());

vi.mock("@cascade/database", () => ({
  Prisma: {
    DbNull: "DB_NULL",
  },
  prisma,
}));

vi.mock("@cascade/core", () => ({
  packageName: "@cascade/core",
  createRootTraceContext: vi.fn<() => unknown>(() => ({
    traceId: TRACE_ID,
    spanId: SPAN_ID,
    parentSpanId: null,
  })),
  createChildTraceContext: vi.fn<
    (input: { traceId: string; parentSpanId: string | null | undefined }) => unknown
  >((input) => ({
    traceId: input.traceId,
    spanId: SPAN_ID,
    parentSpanId: input.parentSpanId ?? null,
  })),
}));

vi.mock("@cascade/storage", () => ({
  resolveJsonValue,
  maybeStoreJsonValue,
}));

vi.mock("./queue/task-runs.js", () => ({
  enqueueTaskRun,
}));

vi.mock("./queue/concurrency-limits.js", () => ({
  tryAcquireQueueConcurrency,
  releaseQueueConcurrency,
}));

vi.mock("./timers/queue-concurrency-lease.js", () => ({
  startQueueConcurrencyLeaseHeartbeat,
}));

vi.mock("./timers/task-run-heartbeat.js", () => ({
  startTaskRunHeartbeat,
}));

vi.mock("./tasks/registry.js", () => ({
  taskRegistry: {
    get: vi.fn<(id: string) => unknown>((id) => {
      if (id !== "hello") {
        return undefined;
      }

      return {
        id: "hello",
        timeoutMs: 30_000,
        retry: {
          maxAttempts: 1,
          delayMs: 0,
          exponentialBackoff: false,
        },
        queue: {
          name: "hello",
          concurrencyLimit: null,
        },
        run: localTaskRun,
      };
    }),
  },
}));

const { processTaskRun } = await import("./task-run-processor.js");

function createMessage() {
  return {
    runId: RUN_ID,
    taskId: TASK_ID,
    environmentId: ENVIRONMENT_ID,
    deploymentId: null,
  } satisfies TaskRunQueueMessage;
}

describe("processTaskRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        taskRun: {
          updateMany: txTaskRunUpdateMany,
        },
        taskAttempt: {
          count: txTaskAttemptCount,
          create: txTaskAttemptCreate,
          update: txTaskAttemptUpdate,
        },
        taskEvent: {
          create: txTaskEventCreate,
        },
      }),
    );

    prisma.taskRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      taskId: TASK_ID,
      status: "PENDING",
      payload: {
        message: "hello",
      },
      delayUntil: null,
      traceId: TRACE_ID,
      triggerSpanId: PARENT_SPAN_ID,
      task: {
        slug: "hello",
        name: "Hello",
      },
    });

    txTaskRunUpdateMany.mockResolvedValue({ count: 1 });
    txTaskAttemptCount.mockResolvedValue(0);
    txTaskAttemptCreate.mockResolvedValue({
      id: ATTEMPT_ID,
      attemptNumber: 1,
    });
    txTaskAttemptUpdate.mockResolvedValue({});
    txTaskEventCreate.mockResolvedValue({});

    resolveJsonValue.mockResolvedValue({
      message: "hello",
    });

    maybeStoreJsonValue.mockImplementation(async (input) => input.value);

    localTaskRun.mockResolvedValue({
      ok: true,
    });

    startTaskRunHeartbeat.mockReturnValue(stopHeartbeat);
    startQueueConcurrencyLeaseHeartbeat.mockReturnValue(stopQueueConcurrencyHeartbeat);

    tryAcquireQueueConcurrency.mockResolvedValue(null);
    releaseQueueConcurrency.mockResolvedValue(undefined);
    enqueueTaskRun.mockResolvedValue(undefined);
  });

  it("executes the matching local task and completes the run", async () => {
    await processTaskRun(createMessage());

    expect(prisma.taskRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: RUN_ID,
          taskId: TASK_ID,
          task: {
            environmentId: ENVIRONMENT_ID,
          },
        },
      }),
    );

    expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: RUN_ID,
          status: "PENDING",
        }),
        data: expect.objectContaining({
          status: "EXECUTING",
          lastHeartbeatAt: expect.any(Date),
          traceId: TRACE_ID,
        }),
      }),
    );

    expect(txTaskAttemptCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          attemptNumber: 1,
          status: "EXECUTING",
          startedAt: expect.any(Date),
        }),
      }),
    );

    expect(startTaskRunHeartbeat).toHaveBeenCalledWith(RUN_ID);

    expect(localTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        taskId: TASK_ID,
        environmentId: ENVIRONMENT_ID,
        payload: {
          message: "hello",
        },
        logger: expect.any(Object),
        signal: expect.any(AbortSignal),
        trace: expect.objectContaining({
          traceId: TRACE_ID,
          spanId: SPAN_ID,
          parentSpanId: PARENT_SPAN_ID,
        }),
      }),
    );

    expect(maybeStoreJsonValue).toHaveBeenCalledWith({
      kind: "OUTPUT",
      environmentId: ENVIRONMENT_ID,
      taskId: RUN_ID,
      runId: RUN_ID,
      value: {
        ok: true,
      },
    });

    expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: RUN_ID,
          status: "EXECUTING",
        },
        data: expect.objectContaining({
          status: "COMPLETED",
          output: {
            ok: true,
          },
          error: "DB_NULL",
          completedAt: expect.any(Date),
        }),
      }),
    );

    expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ATTEMPT_ID,
        },
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: expect.any(Date),
        }),
      }),
    );

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.completed",
          level: "INFO",
          message: "Task run completed successfully",
        }),
      }),
    );

    expect(stopHeartbeat).toHaveBeenCalledOnce();
    expect(startQueueConcurrencyLeaseHeartbeat).not.toHaveBeenCalled();
    expect(stopQueueConcurrencyHeartbeat).not.toHaveBeenCalled();
    expect(releaseQueueConcurrency).not.toHaveBeenCalled();

    expect(enqueueTaskRun).not.toHaveBeenCalled();
  });

  it("marks the run failed when the matching local task throws", async () => {
    const taskError = new Error("Task exploded");

    localTaskRun.mockRejectedValue(taskError);

    await processTaskRun(createMessage());

    expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: RUN_ID,
          status: "PENDING",
        }),
        data: expect.objectContaining({
          status: "EXECUTING",
          lastHeartbeatAt: expect.any(Date),
          traceId: TRACE_ID,
        }),
      }),
    );

    expect(txTaskRunUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: RUN_ID,
          status: "EXECUTING",
        },
        data: expect.objectContaining({
          status: "FAILED",
          output: "DB_NULL",
          error: expect.objectContaining({
            name: "Error",
            message: "Task exploded",
          }),
          completedAt: expect.any(Date),
        }),
      }),
    );

    expect(txTaskAttemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ATTEMPT_ID,
        },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.objectContaining({
            name: "Error",
            message: "Task exploded",
          }),
          completedAt: expect.any(Date),
        }),
      }),
    );

    expect(txTaskEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRunId: RUN_ID,
          taskAttemptId: ATTEMPT_ID,
          type: "task.run.failed",
          level: "ERROR",
          message: "Task run failed",
        }),
      }),
    );

    expect(enqueueTaskRun).not.toHaveBeenCalled();
    expect(stopHeartbeat).toHaveBeenCalledOnce();
  });
});
